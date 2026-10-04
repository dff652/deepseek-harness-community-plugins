import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDsh } from '../scripts/lib/agent-mail-host.mjs';
import { probeActivation } from '../scripts/lib/dsh-activation-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-agent-mail', 'cordis.patch.yml');

const dshBin = resolveDsh('Agent Mail activation acceptance');
assert.ok(dshBin, 'dsh executable path must not be empty');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-activation.'));

try {
  const cases = [
    {
      name: 'unset-command',
      mutate(env) {
        delete env.DSH_AGENT_MAIL_COMMAND;
      },
      expected: /DSH_AGENT_MAIL_COMMAND is required/,
    },
    {
      name: 'blank-command',
      mutate(env) {
        env.DSH_AGENT_MAIL_COMMAND = '   ';
      },
      expected: /DSH_AGENT_MAIL_COMMAND is required/,
    },
    {
      name: 'relative-command',
      mutate(env) {
        env.DSH_AGENT_MAIL_COMMAND = 'agent-mail-mcp';
      },
      expected: /DSH_AGENT_MAIL_COMMAND must be an absolute path/,
    },
    {
      name: 'unset-home',
      mutate(env) {
        delete env.DSH_AGENT_MAIL_HOME;
      },
      expected: /DSH_AGENT_MAIL_HOME is required/,
    },
    {
      name: 'blank-home',
      mutate(env) {
        env.DSH_AGENT_MAIL_HOME = '   ';
      },
      expected: /DSH_AGENT_MAIL_HOME is required/,
    },
    {
      name: 'relative-home',
      mutate(env) {
        env.DSH_AGENT_MAIL_HOME = 'relative-mail-home';
      },
      expected: /DSH_AGENT_MAIL_HOME must be an absolute path/,
    },
    {
      name: 'human-identity',
      mutate(env) {
        env.DSH_AGENT_MAIL_ID = 'human@local';
      },
      expected: /human@local|Harness identity/,
    },
  ];

  for (const item of cases) {
    const env = {
      ...process.env,
      DSH_HOME: path.join(work, item.name),
      DSH_AGENT_MAIL_COMMAND: path.join(work, 'unused-agent-mail-mcp'),
      DSH_AGENT_MAIL_HOME: path.join(work, 'unused-mail-home'),
      DSH_AGENT_MAIL_ID: 'dsh-export@local',
    };
    item.mutate(env);
    const result = await probeActivation(
      dshBin,
      [patchPath],
      env,
      work,
      ['mcp-agent-mail'],
    );
    const mcp = result.rows.find((row) => row.id === 'mcp-agent-mail');
    assert.equal(mcp?.state, 3, `${item.name}: ${JSON.stringify(mcp)}`);
    assert.match(mcp?.error ?? '', item.expected, item.name);
    assert.match(result.output, /entries? did not activate/i, item.name);
    assert.deepEqual(
      result.tools.filter((name) => name.startsWith('mcp__agent-mail__')),
      [],
      `${item.name}: invalid provider config must expose no Agent Mail tools`,
    );
  }

  console.log('Agent Mail DSH activation negative checks: PASS (7 failed MCP rows, web host retained)');
} finally {
  await rm(work, { recursive: true, force: true });
}
