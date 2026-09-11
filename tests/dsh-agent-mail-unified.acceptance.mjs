import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileAsync, resolveDsh, runDsh, sha256File } from '../scripts/lib/agent-mail-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-unified.'));
const dsh = resolveDsh();
const env = { ...process.env, DSH_HOME: path.join(work, 'dsh-home') };
async function run(args) {
  const result = await runDsh(dsh, args, env, work, 180000);
  assert.equal(result.code, 0, `${args.join(' ')}: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
function assertUnified(config) {
  assert.equal((config.match(/id: mcp-agent-mail\b/g) ?? []).length, 1);
  assert.equal((config.match(/id: dsh-agent-mail-ui\b/g) ?? []).length, 1);
  assert.match(config, /name: ['"]?@dff652\/dsh-agent-mail['"]?\s*$/m);
  assert.doesNotMatch(config, /name: ['"]?@dff652\/dsh-agent-mail-ui\b/);
}
try {
  const { stdout } = await execFileAsync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', work,
  ], { cwd: path.join(root, 'packages/dsh-agent-mail') });
  const tarball = path.join(work, JSON.parse(stdout)[0].filename);
  console.log(`Unified artifact SHA-256: ${await sha256File(tarball)}`);
  for (const profile of ['web', 'headless']) {
    await run(['plugin', '--profile', profile, 'add', '-w', tarball]);
    assertUnified(await run(['--profile', profile, '--dump-config']));
    await run(['plugin', '--profile', profile, 'remove', '@dff652/dsh-agent-mail']);
  }

  const oldMail = process.env.DSH_AGENT_MAIL_OLD_TARBALL;
  const oldUi = process.env.DSH_AGENT_MAIL_OLD_UI_TARBALL;
  assert.ok(oldMail && oldUi, 'migration gate requires both reviewed old tarballs');
  await run(['plugin', '--profile', 'web', 'add', '-w', oldMail]);
  await run(['plugin', '--profile', 'web', 'add', '-w', oldUi]);
  await run(['plugin', '--profile', 'web', 'add', '-w', tarball]);
  const duplicate = await runDsh(dsh, ['--profile', 'web', '--port', '0'], {
    ...env, DSH_AGENT_MAIL_COMMAND: '/bin/false',
    DSH_AGENT_MAIL_HOME: work, DSH_AGENT_MAIL_ID: 'migration-check@local',
  }, work, 30000);
  assert.notEqual(duplicate.code, 0);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /duplicate loader entry id: dsh-agent-mail-ui/);
  await run(['plugin', '--profile', 'web', 'remove', '@dff652/dsh-agent-mail-ui']);
  await run(['plugin', '--profile', 'web', 'add', '-w', tarball]);
  assertUnified(await run(['--profile', 'web', '--dump-config']));
  console.log('PASS: exact unified tarball web/headless install, removal, old two-package migration');
} finally {
  await rm(work, { recursive: true, force: true });
}
