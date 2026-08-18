import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDsh, runDsh } from '../scripts/lib/agent-mail-host.mjs';

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

  console.log('Agent Mail DSH activation negative checks: PASS (7 cases)');
} finally {
  await rm(work, { recursive: true, force: true });
}
