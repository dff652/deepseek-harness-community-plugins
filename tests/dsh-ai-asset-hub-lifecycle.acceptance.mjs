import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-ai-asset-hub', 'cordis.patch.yml');
const identity = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'aiah-provider-identity.json'), 'utf8'),
);
const execFileAsync = promisify(execFile);

function resolveDsh() {
  if (process.env.DSH_BIN) return process.env.DSH_BIN;
  try {
    return execFileSync('/usr/bin/which', ['dsh'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(
      'AIAH lifecycle acceptance requires a reviewed dsh executable; set DSH_BIN or add dsh to PATH',
      { cause: error },
    );
  }
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function resolveReviewedAiah(work) {
  if (process.env.DSH_AIAH_COMMAND) {
    const command = process.env.DSH_AIAH_COMMAND.trim();
    assert.equal(path.isAbsolute(command), true, 'DSH_AIAH_COMMAND must be absolute');
    const digest = await sha256File(command);
    assert.equal(digest, identity.linuxAmd64.sha256, 'DSH_AIAH_COMMAND is not the reviewed v0.1.11 linux_amd64 asset');
    return command;
  }

  const assetDir = path.join(work, 'release');
  await mkdir(assetDir, { recursive: true });
  await execFileAsync(
    'gh',
    [
      'release',
      'download',
      identity.releaseTag,
      '--repo',
      'dff652/ai-asset-hub',
      '--pattern',
      identity.linuxAmd64.asset,
      '--pattern',
      'SHA256SUMS',
      '--dir',
      assetDir,
    ],
    { timeout: 120000 },
  );
  await execFileAsync('sha256sum', ['--check', '--ignore-missing', 'SHA256SUMS'], {
    cwd: assetDir,
  });
  const downloaded = path.join(assetDir, identity.linuxAmd64.asset);
  assert.equal(await sha256File(downloaded), identity.linuxAmd64.sha256);
  const command = path.join(work, 'bin', 'aiah');
  await mkdir(path.dirname(command), { recursive: true });
  await writeFile(command, await readFile(downloaded));
  await chmod(command, 0o755);
  return command;
}

function toolEnv(env) {
  return {
    ...env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || process.env.PATH || ''}`,
  };
}

async function runDsh(dshBin, args, env, cwd, timeoutMs = 25000) {
  try {
    const result = await execFileAsync(dshBin, args, {
      cwd,
      env: toolEnv(env),
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code === 'ENOENT' ? 127 : (error.status ?? 1),
      stdout: error.stdout ?? '',
      stderr: `${error.stderr ?? ''}${error.message ?? ''}`,
    };
  }
}

async function pidsMatching(pattern) {
  const { stdout } = await execFileAsync('/bin/ps', ['-eo', 'pid=,args=']);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(pattern))
    .map((line) => Number(line.split(/\s+/, 1)[0]))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const dshBin = resolveDsh();
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-lifecycle.'));
let command;

try {
  command = await resolveReviewedAiah(work);
  const pattern = command;
  const dupPatch = path.join(work, 'dup.patch.yml');
  await writeFile(
    dupPatch,
    `- insert:
    - id: mcp-aiah-dup
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: aiah
        transport: stdio
        command: !!js process.env.DSH_AIAH_COMMAND
        args:
          - mcp
        failOnStartupError: true
`,
  );

  const missing = path.join(work, 'missing-aiah');
  const missingResult = await runDsh(
    dshBin,
    ['--patch', patchPath, '--profile', 'web', '--port', '0'],
    { ...process.env, DSH_HOME: path.join(work, 'dsh-missing'), DSH_AIAH_COMMAND: missing },
    work,
  );
  const missingOut = `${missingResult.stdout}\n${missingResult.stderr}`;
  assert.notEqual(missingResult.code, 0);
  assert.match(missingOut, /ENOENT|not found|spawn|initial connection/i);
  assert.deepEqual(await pidsMatching(missing), []);

  const dupResult = await runDsh(
    dshBin,
    ['--patch', patchPath, '--patch', dupPatch, '--profile', 'web', '--port', '0'],
    { ...process.env, DSH_HOME: path.join(work, 'dsh-dup'), DSH_AIAH_COMMAND: command },
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
  const child = spawn(dshBin, ['--patch', patchPath, '--profile', 'web', '--port', '0'], {
    cwd: work,
    env: toolEnv({
      ...process.env,
      DSH_HOME: reconnHome,
      DSH_AIAH_COMMAND: command,
    }),
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

  try {
    const firstPids = await waitFor(async () => {
      const pids = await pidsMatching(pattern);
      return pids.length > 0 ? pids : null;
    }, 25000, 'initial aiah mcp child');
    assert.ok(!firstPids.includes(child.pid), 'refusing to treat the dsh pid as the provider');
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const settled = await pidsMatching(pattern);
    assert.ok(settled.length > 0, `provider exited before ready: ${output.slice(-500)}`);
    for (const pid of settled) process.kill(pid, 'SIGKILL');

    const secondPids = await waitFor(async () => {
      const pids = (await pidsMatching(pattern)).filter((pid) => !settled.includes(pid));
      return pids.length > 0 ? pids : null;
    }, 30000, 'reconnected aiah mcp child');
    assert.ok(secondPids.every((pid) => !settled.includes(pid)));
    assert.ok(secondPids.length >= 1 && secondPids.length <= 3);
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
          resolve();
        }, 8000);
        child.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  await waitFor(async () => (await pidsMatching(pattern)).length === 0, 10000, 'provider cleanup');
  assert.deepEqual(await pidsMatching(pattern), []);
  console.log('AIAH DSH lifecycle checks: PASS (missing, duplicate namespace, reconnect, cleanup)');
} finally {
  await rm(work, { recursive: true, force: true });
}
