import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileAsync, resolveDsh, runDsh, sha256File } from '../scripts/lib/agent-mail-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dshBin = resolveDsh('Agent Mail UI clean-profile acceptance');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-ui-clean-profile.'));

try {
  const cache = path.join(work, 'npm-cache');
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', work],
    { cwd: path.join(root, 'packages', 'dsh-agent-mail-ui') },
  );
  const tarball = path.join(work, JSON.parse(stdout)[0].filename);
  console.log(`Agent Mail UI candidate SHA-256: ${await sha256File(tarball)}`);
  const env = { ...process.env, DSH_HOME: path.join(work, 'dsh-home') };

  for (const profile of ['web', 'headless']) {
    const add = await runDsh(
      dshBin,
      ['plugin', '--profile', profile, 'add', '-w', tarball],
      env,
      work,
      120000,
    );
    if (add.code !== 0 && /pnpm not found/i.test(`${add.stdout}\n${add.stderr}`)) {
      throw new Error(`pnpm is required for packed-artifact install acceptance: ${add.stderr}`);
    }
    assert.equal(add.code, 0, `${profile} add: ${add.stdout}\n${add.stderr}`);
    const dumped = await runDsh(dshBin, ['--profile', profile, '--dump-config'], env, work);
    assert.equal(dumped.code, 0, dumped.stderr);
    assert.equal((dumped.stdout.match(/id: dsh-agent-mail-ui\b/g) ?? []).length, 1, profile);
    assert.match(dumped.stdout, /@dff652\/dsh-agent-mail-ui/);
    assert.doesNotMatch(dumped.stdout, /DSH_AGENT_MAIL_COMMAND/);
  }

  for (const profile of ['web', 'headless']) {
    const removed = await runDsh(
      dshBin,
      ['plugin', '--profile', profile, 'remove', '@dff652/dsh-agent-mail-ui'],
      env,
      work,
      120000,
    );
    assert.equal(removed.code, 0, `${profile} remove: ${removed.stdout}\n${removed.stderr}`);
    const after = await runDsh(dshBin, ['--profile', profile, '--dump-config'], env, work);
    assert.equal(after.code, 0, after.stderr);
    assert.doesNotMatch(after.stdout, /id: dsh-agent-mail-ui\b/);
  }

  console.log('Agent Mail UI clean-profile checks: PASS (web/headless install once, remove, no MCP spawn)');
} finally {
  await rm(work, { recursive: true, force: true });
}
