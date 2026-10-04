import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  descendantPidsMatching,
  execFileAsync,
  initMailHome,
  mailEnv,
  pidExists,
  pidsMatching,
  resolveDsh,
  resolveReviewedProvider,
  runDsh,
  sha256File,
  stopProcessGroup,
  toolEnv,
  waitFor,
  writeDupPatch,
} from '../scripts/lib/agent-mail-host.mjs';
import { probeActivation } from '../scripts/lib/dsh-activation-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-provider-identity.json'), 'utf8'),
);

const dshBin = resolveDsh('Agent Mail lifecycle acceptance');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-lifecycle.'));
const sender = 'dsh-export@local';

async function resolvePluginTarball(work, cache) {
  const supplied = String(process.env.DSH_AGENT_MAIL_PLUGIN_TARBALL || '').trim();
  const expectedSha256 = String(process.env.DSH_AGENT_MAIL_PLUGIN_SHA256 || '').trim();
  if (supplied || expectedSha256) {
    assert.equal(path.isAbsolute(supplied), true, 'DSH_AGENT_MAIL_PLUGIN_TARBALL must be absolute');
    assert.match(expectedSha256, /^[0-9a-f]{64}$/, 'DSH_AGENT_MAIL_PLUGIN_SHA256 must be lowercase SHA-256');
    const metadata = await lstat(supplied);
    assert.equal(metadata.isSymbolicLink(), false, 'plugin tarball must not be a symbolic link');
    assert.equal(metadata.isFile(), true, 'plugin tarball must be a regular file');
    assert.equal(await sha256File(supplied), expectedSha256, 'plugin tarball digest mismatch');
    return supplied;
  }

  const packageDir = path.join(root, 'packages', 'dsh-agent-mail');
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', work],
    { cwd: packageDir },
  );
  return path.join(work, JSON.parse(stdout)[0].filename);
}

try {
  const cache = path.join(work, 'npm-cache');
  const tarball = await resolvePluginTarball(work, cache);
  const provider = await resolveReviewedProvider(work, identity);
  const { home } = await initMailHome(provider.cli, work, [sender]);
  // Script shims may replace argv[0] with the shim name; in that case use the
  // actual provider entry path so PID checks identify the spawned process.
  const processPattern = String(process.env.DSH_AGENT_MAIL_PROCESS_PATTERN || '').trim();
  assert.ok(!processPattern || path.isAbsolute(processPattern),
    'DSH_AGENT_MAIL_PROCESS_PATTERN must be absolute when provided');
  const pattern = processPattern || provider.pattern;
  async function hasTestHome(pid) {
    try {
      const environment = await readFile('/proc/' + pid + '/environ', 'utf8');
      return environment.split('\0').some((entry) =>
        entry === 'AGENT_MAIL_HOME=' + home || entry === 'DSH_AGENT_MAIL_HOME=' + home);
    } catch {
      return false;
    }
  }
  async function liveProviderPids() {
    const pids = await pidsMatching(pattern);
    const owned = await Promise.all(pids.map(async (pid) => (await hasTestHome(pid)) ? pid : null));
    return owned.filter((pid) => pid !== null);
  }
  async function descendantProviderPids(rootPid) {
    const pids = await descendantPidsMatching(rootPid, pattern);
    const owned = await Promise.all(pids.map(async (pid) => (await hasTestHome(pid)) ? pid : null));
    return owned.filter((pid) => pid !== null);
  }
  async function installWeb(env) {
    const installed = await runDsh(dshBin,
      ['plugin', '--profile', 'web', 'add', '-w', tarball], env, work, 180000);
    assert.equal(installed.code, 0, `${installed.stdout}\n${installed.stderr}`);
  }

  const missing = path.join(work, 'missing-agent-mail-mcp');
  const missingEnv = mailEnv(home, sender, missing, { DSH_HOME: path.join(work, 'dsh-missing') });
  await installWeb(missingEnv);
  const missingResult = await probeActivation(
    dshBin,
    [],
    missingEnv,
    work,
    ['mcp-agent-mail', 'dsh-agent-mail-ui'],
  );
  const missingMcp = missingResult.rows.find((row) => row.id === 'mcp-agent-mail');
  assert.equal(missingMcp?.state, 3, JSON.stringify(missingMcp));
  assert.match(missingMcp?.error ?? '', /ENOENT|not found|spawn|initial connection/i);
  assert.match(missingResult.output, /1 entry did not activate/i);
  assert.equal(missingResult.rows.find((row) => row.id === 'dsh-agent-mail-ui')?.state, 2);
  assert.deepEqual(missingResult.tools.filter((name) => name.startsWith('mcp__agent-mail__')), []);
  assert.deepEqual(await pidsMatching(missing), []);

  const dupPatch = path.join(work, 'dup.patch.yml');
  await writeDupPatch(dupPatch, 'mcp-agent-mail-dup', 'agent-mail');
  const dupEnv = mailEnv(home, sender, provider.command, { DSH_HOME: path.join(work, 'dsh-dup') });
  await installWeb(dupEnv);
  const dupResult = await probeActivation(
    dshBin,
    [dupPatch],
    dupEnv,
    work,
    ['mcp-agent-mail', 'mcp-agent-mail-dup', 'dsh-agent-mail-ui'],
  );
  assert.equal(dupResult.rows.find((row) => row.id === 'mcp-agent-mail')?.state, 2);
  const duplicate = dupResult.rows.find((row) => row.id === 'mcp-agent-mail-dup');
  assert.equal(duplicate?.state, 3, JSON.stringify(duplicate));
  assert.match(duplicate?.error ?? '', /already in use|serverName/i);
  assert.match(dupResult.output, /1 entry did not activate/i);
  assert.equal(dupResult.rows.find((row) => row.id === 'dsh-agent-mail-ui')?.state, 2);
  assert.ok(dupResult.tools.some((name) => name.startsWith('mcp__agent-mail__')),
    'the first MCP row retains its tools after the duplicate row fails');
  await waitFor(
    async () => (await liveProviderPids()).length === 0,
    10000,
    'duplicate-namespace provider cleanup',
  );
  assert.deepEqual(await liveProviderPids(), []);

  const reconnHome = path.join(work, 'dsh-reconn');
  const env = mailEnv(home, sender, provider.command, { DSH_HOME: reconnHome });
  await installWeb(env);
  const child = spawn(dshBin, ['--profile', 'web', '--port', '0'], {
    cwd: work,
    env: toolEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });

  const ownedProviderPids = new Set();
  try {
    const firstPids = await waitFor(async () => {
      const pids = await descendantProviderPids(child.pid);
      return pids.length > 0 ? pids : null;
    }, 25000, 'initial agent-mail mcp child');
    assert.ok(!firstPids.includes(child.pid), 'refusing to treat the dsh pid as the provider');
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const settled = await descendantProviderPids(child.pid);
    assert.ok(settled.length > 0, `provider exited before ready: ${output.slice(-500)}`);
    for (const pid of settled) {
      ownedProviderPids.add(pid);
      process.kill(pid, 'SIGKILL');
    }

    const secondPids = await waitFor(async () => {
      const pids = (await descendantProviderPids(child.pid)).filter(
        (pid) => !settled.includes(pid),
      );
      return pids.length > 0 ? pids : null;
    }, 30000, 'reconnected agent-mail mcp child');
    assert.ok(secondPids.every((pid) => !settled.includes(pid)));
    assert.ok(secondPids.length >= 1 && secondPids.length <= 3);
    secondPids.forEach((pid) => ownedProviderPids.add(pid));
  } finally {
    await stopProcessGroup(child);
  }

  await waitFor(async () => (await liveProviderPids()).length === 0, 10000, 'provider cleanup');
  assert.deepEqual(await liveProviderPids(), []);
  assert.equal([...ownedProviderPids].some((pid) => pidExists(pid)), false);

  const installEnv = mailEnv(home, sender, provider.command, {
    DSH_HOME: path.join(work, 'dsh-install'),
  });
  const add = await runDsh(
    dshBin,
    ['plugin', '--profile', 'headless', 'add', '-w', tarball],
    installEnv,
    work,
    120000,
  );
  if (add.code !== 0 && /pnpm not found/i.test(`${add.stdout}\n${add.stderr}`)) {
    throw new Error(`pnpm is required for packed-artifact install acceptance: ${add.stderr}`);
  }
  assert.equal(add.code, 0, `${add.stdout}\n${add.stderr}`);
  const dumped = await runDsh(dshBin, ['--profile', 'headless', '--dump-config'], installEnv, work);
  assert.equal(dumped.code, 0, dumped.stderr);
  assert.match(dumped.stdout, /id: mcp-agent-mail/);
  assert.match(dumped.stdout, /serverName: agent-mail/);
  const removed = await runDsh(
    dshBin,
    ['plugin', '--profile', 'headless', 'remove', '@dff652/dsh-agent-mail'],
    installEnv,
    work,
    120000,
  );
  assert.equal(removed.code, 0, `${removed.stdout}\n${removed.stderr}`);
  const after = await runDsh(dshBin, ['--profile', 'headless', '--dump-config'], installEnv, work);
  assert.equal(after.code, 0, after.stderr);
  assert.doesNotMatch(after.stdout, /id: mcp-agent-mail/);
  assert.deepEqual(await liveProviderPids(), []);

  console.log(
    'Agent Mail DSH lifecycle checks: PASS (missing row, duplicate namespace, reconnect, cleanup, install/remove)',
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
