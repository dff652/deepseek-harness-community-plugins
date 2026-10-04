import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileAsync, resolveDsh, runDsh, sha256File } from '../scripts/lib/agent-mail-host.mjs';
import { probeActivation } from '../scripts/lib/dsh-activation-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-unified.'));
const dsh = resolveDsh();
const migrationDsh = process.env.DSH_AGENT_MAIL_MIGRATION_DSH_BIN || dsh;
const env = { ...process.env, DSH_HOME: path.join(work, 'dsh-home') };
async function run(args, binary = dsh) {
  const result = await runDsh(binary, args, env, work, 180000);
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
  assert.ok(path.isAbsolute(migrationDsh), 'migration dsh path must be absolute');
  let tarball = process.env.DSH_AGENT_MAIL_UNIFIED_TARBALL;
  if (!tarball) {
    const { stdout } = await execFileAsync('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', work,
    ], { cwd: path.join(root, 'packages/dsh-agent-mail') });
    tarball = path.join(work, JSON.parse(stdout)[0].filename);
  }
  assert.ok(path.isAbsolute(tarball), 'unified tarball path must be absolute');
  console.log(`Unified artifact SHA-256: ${await sha256File(tarball)}`);
  for (const profile of ['web', 'headless']) {
    await run(['plugin', '--profile', profile, 'add', '-w', tarball]);
    assertUnified(await run(['--profile', profile, '--dump-config']));
    await run(['plugin', '--profile', profile, 'remove', '@dff652/dsh-agent-mail']);
  }

  const oldMail = process.env.DSH_AGENT_MAIL_OLD_TARBALL;
  const oldUi = process.env.DSH_AGENT_MAIL_OLD_UI_TARBALL;
  assert.ok(oldMail && oldUi, 'migration gate requires both reviewed old tarballs');
  if (migrationDsh !== dsh) {
    const before = await run(['--profile', 'web', '--dump-config']);
    const incompatible = await runDsh(dsh, ['plugin', '--profile', 'web', 'add', '-w', oldMail], env, work, 180000);
    assert.notEqual(incompatible.code, 0, 'old MCP exact peer must be rejected on the new runtime');
    assert.match(`${incompatible.stdout}\n${incompatible.stderr}`, /@dff652\/dsh-agent-mail[^\n]*incompatible/);
    assert.equal(await run(['--profile', 'web', '--dump-config']), before, 'rejected installation must restore the profile');
  }
  env.DSH_HOME = path.join(work, 'migration-home');
  await run(['plugin', '--profile', 'web', 'add', '-w', oldMail], migrationDsh);
  await run(['plugin', '--profile', 'web', 'add', '-w', oldUi], migrationDsh);
  await run(['plugin', '--profile', 'web', 'add', '-w', tarball]);
  const negativeEnv = {
    ...env, DSH_AGENT_MAIL_COMMAND: '/bin/false',
    DSH_AGENT_MAIL_HOME: work, DSH_AGENT_MAIL_ID: 'migration-check@local',
  };
  if (migrationDsh !== dsh) {
    const activation = await probeActivation(dsh, [], negativeEnv, work, ['dsh-agent-mail-ui', 'mcp-agent-mail']);
    assert.match(activation.output, /skipping profile bundle "@dff652\/dsh-agent-mail-ui"[^\n]*incompatible/);
    assert.equal(activation.rows.filter(row => row.id === 'dsh-agent-mail-ui').length, 1);
    assert.equal(activation.rows.find(row => row.id === 'dsh-agent-mail-ui')?.state, 2);
    assert.equal(activation.rows.find(row => row.id === 'mcp-agent-mail')?.state, 3);
    assert.deepEqual(activation.tools.filter(name => name.startsWith('mcp__agent-mail__')), []);
  } else {
    const duplicate = await runDsh(dsh, ['--profile', 'web', '--port', '0'], negativeEnv, work, 30000);
    assert.notEqual(duplicate.code, 0);
    assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /duplicate loader entry id: dsh-agent-mail-ui/);
  }
  await run(['plugin', '--profile', 'web', 'remove', '@dff652/dsh-agent-mail-ui']);
  await run(['plugin', '--profile', 'web', 'add', '-w', tarball]);
  assertUnified(await run(['--profile', 'web', '--dump-config']));
  console.log('PASS: exact unified tarball web/headless install, removal, old two-package migration');
} finally {
  await rm(work, { recursive: true, force: true });
}
