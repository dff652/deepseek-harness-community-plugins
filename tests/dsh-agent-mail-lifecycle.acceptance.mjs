import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  stopProcessGroup,
  toolEnv,
  waitFor,
  writeDupPatch,
} from '../scripts/lib/agent-mail-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-agent-mail', 'cordis.patch.yml');
const identity = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-provider-identity.json'), 'utf8'),
);

const dshBin = resolveDsh('Agent Mail lifecycle acceptance');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-lifecycle.'));
const sender = 'dsh-export@local';

try {
  const provider = await resolveReviewedProvider(work, identity);
  const { home } = await initMailHome(provider.cli, work, [sender]);
  const pattern = provider.pattern;

  const missing = path.join(work, 'missing-agent-mail-mcp');
  const missingEnv = mailEnv(home, sender, missing, { DSH_HOME: path.join(work, 'dsh-missing') });
  const missingResult = await runDsh(
    dshBin,
    ['--patch', patchPath, '--profile', 'web', '--port', '0'],
    missingEnv,
    work,
  );
  const missingOut = `${missingResult.stdout}\n${missingResult.stderr}`;
  assert.notEqual(missingResult.code, 0);
  assert.match(missingOut, /ENOENT|not found|spawn|initial connection/i);
  assert.deepEqual(await pidsMatching(missing), []);

  const dupPatch = path.join(work, 'dup.patch.yml');
  await writeDupPatch(dupPatch, 'mcp-agent-mail-dup', 'agent-mail');
  const dupEnv = mailEnv(home, sender, provider.command, { DSH_HOME: path.join(work, 'dsh-dup') });
  const dupResult = await runDsh(
    dshBin,
    ['--patch', patchPath, '--patch', dupPatch, '--profile', 'web', '--port', '0'],
    dupEnv,
    work,
  );
  const dupOut = `${dupResult.stdout}\n${dupResult.stderr}`;
  assert.notEqual(dupResult.code, 0);
  assert.match(dupOut, /already in use|serverName/);
  await waitFor(
    async () => (await pidsMatching(pattern)).length === 0,
    10000,
    'duplicate-namespace provider cleanup',
  );
  assert.deepEqual(await pidsMatching(pattern), []);

  const reconnHome = path.join(work, 'dsh-reconn');
  const env = mailEnv(home, sender, provider.command, { DSH_HOME: reconnHome });
  const child = spawn(dshBin, ['--patch', patchPath, '--profile', 'web', '--port', '0'], {
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
      const pids = await descendantPidsMatching(child.pid, pattern);
      return pids.length > 0 ? pids : null;
    }, 25000, 'initial agent-mail mcp child');
    assert.ok(!firstPids.includes(child.pid), 'refusing to treat the dsh pid as the provider');
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const settled = await descendantPidsMatching(child.pid, pattern);
    assert.ok(settled.length > 0, `provider exited before ready: ${output.slice(-500)}`);
    for (const pid of settled) {
      ownedProviderPids.add(pid);
      process.kill(pid, 'SIGKILL');
    }

    const secondPids = await waitFor(async () => {
      const pids = (await descendantPidsMatching(child.pid, pattern)).filter(
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

  await waitFor(async () => (await pidsMatching(pattern)).length === 0, 10000, 'provider cleanup');
  assert.deepEqual(await pidsMatching(pattern), []);
  assert.equal([...ownedProviderPids].some((pid) => pidExists(pid)), false);

  const cache = path.join(work, 'npm-cache');
  const packageDir = path.join(root, 'packages', 'dsh-agent-mail');
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', work],
    { cwd: packageDir },
  );
  const tarball = path.join(work, JSON.parse(stdout)[0].filename);
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
  assert.deepEqual(await pidsMatching(pattern), []);

  console.log(
    'Agent Mail DSH lifecycle checks: PASS (missing, duplicate namespace, reconnect, cleanup, install/remove)',
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
