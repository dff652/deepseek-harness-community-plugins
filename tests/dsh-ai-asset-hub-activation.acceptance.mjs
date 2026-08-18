import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-ai-asset-hub', 'cordis.patch.yml');
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
      'DSH activation acceptance requires a reviewed dsh executable; set DSH_BIN or add dsh to PATH',
      { cause: error },
    );
  }
}

async function runDsh(dshBin, env, cwd) {
  try {
    const result = await execFileAsync(
      dshBin,
      ['--patch', patchPath, '--profile', 'web', '--port', '0'],
      {
        cwd,
        env,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code === 'ENOENT' ? 127 : (error.status ?? 1),
      stdout: error.stdout ?? '',
      stderr: `${error.stderr ?? ''}${error.message ?? ''}`,
    };
  }
}

const dshBin = resolveDsh();
assert.ok(dshBin, 'dsh executable path must not be empty');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-activation.'));

try {
  const cases = [
    {
      name: 'unset-command',
      mutate(env) {
        delete env.DSH_AIAH_COMMAND;
      },
      expected: /DSH_AIAH_COMMAND is required/,
    },
    {
      name: 'blank-command',
      mutate(env) {
        env.DSH_AIAH_COMMAND = '   ';
      },
      expected: /DSH_AIAH_COMMAND is required/,
    },
    {
      name: 'relative-command',
      mutate(env) {
        env.DSH_AIAH_COMMAND = 'aiah';
      },
      expected: /DSH_AIAH_COMMAND must be an absolute path/,
    },
  ];

  for (const item of cases) {
    const env = { ...process.env, DSH_HOME: path.join(work, item.name) };
    item.mutate(env);
    const result = await runDsh(dshBin, env, work);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.code, 0, `${item.name} unexpectedly activated DSH`);
    assert.match(output, item.expected, item.name);
  }

  console.log('AIAH DSH activation negative checks: PASS (3 cases)');
} finally {
  await rm(work, { recursive: true, force: true });
}
