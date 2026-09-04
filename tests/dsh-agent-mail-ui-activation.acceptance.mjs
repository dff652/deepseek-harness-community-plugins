import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDsh, runDsh } from '../scripts/lib/agent-mail-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(root, 'packages', 'dsh-agent-mail-ui', 'cordis.patch.yml');
const dshBin = resolveDsh('Agent Mail UI activation acceptance');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-ui-activation.'));

try {
  const env = {
    ...process.env,
    DSH_HOME: path.join(work, 'dsh-home'),
  };
  const result = await runDsh(
    dshBin,
    ['--patch', patchPath, '--profile', 'headless', '--dump-config'],
    env,
    work,
  );
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /id: dsh-agent-mail-ui\b/);
  assert.doesNotMatch(result.stdout, /DSH_AGENT_MAIL_COMMAND is required/);
  console.log('Agent Mail UI activation check: PASS (plain insert, no MCP env required)');
} finally {
  await rm(work, { recursive: true, force: true });
}
