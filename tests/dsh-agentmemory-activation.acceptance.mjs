import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDsh, runDsh } from '../scripts/lib/agentmemory-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-agentmemory', 'cordis.patch.yml');

const dshBin = resolveDsh('AgentMemory activation acceptance');
assert.ok(dshBin, 'dsh executable path must not be empty');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-activation.'));

try {
  const cases = [
    {
      name: 'unset-command',
      mutate(env) {
        delete env.DSH_AGENTMEMORY_COMMAND;
      },
      expected: /DSH_AGENTMEMORY_COMMAND is required/,
    },
    {
      name: 'blank-command',
      mutate(env) {
        env.DSH_AGENTMEMORY_COMMAND = '   ';
      },
      expected: /DSH_AGENTMEMORY_COMMAND is required/,
    },
    {
      name: 'relative-command',
      mutate(env) {
        env.DSH_AGENTMEMORY_COMMAND = 'relative-agentmemory';
      },
      expected: /DSH_AGENTMEMORY_COMMAND must be an absolute path/,
    },
  ];

  for (const item of cases) {
    const env = {
      ...process.env,
      DSH_HOME: path.join(work, item.name),
      DSH_AGENTMEMORY_COMMAND: path.join(work, 'unused-agentmemory-adapter'),
    };
    item.mutate(env);
    const result = await runDsh(
      dshBin,
      ['--patch', patchPath, '--profile', 'web', '--port', '0'],
      env,
      work,
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.code, 0, `${item.name} unexpectedly activated DSH`);
    assert.match(output, item.expected, item.name);
  }

  console.log('AgentMemory DSH activation negative checks: PASS (3 cases)');
} finally {
  await rm(work, { recursive: true, force: true });
}
