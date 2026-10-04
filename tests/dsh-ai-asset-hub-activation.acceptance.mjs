import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDsh } from '../scripts/lib/agent-mail-host.mjs';
import { probeActivation } from '../scripts/lib/dsh-activation-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-ai-asset-hub', 'cordis.patch.yml');
const dshBin = resolveDsh('AIAH activation acceptance');
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
    const result = await probeActivation(dshBin, [patchPath], env, work, ['mcp-aiah']);
    assert.notEqual(result.rows[0].state, 2, `${item.name} unexpectedly activated AIAH`);
    assert.match(result.output, item.expected, item.name);
    assert.ok(result.tools.every(name => !name.startsWith('mcp__aiah__')), item.name);
  }

  console.log('AIAH DSH activation negative checks: PASS (3 cases)');
} finally {
  await rm(work, { recursive: true, force: true });
}
