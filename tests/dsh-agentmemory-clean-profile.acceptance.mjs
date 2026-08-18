import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agentmemoryEnv,
  execFileAsync,
  pidsMatching,
  resolveDsh,
  runDsh,
  stopProcessGroup,
  toolEnv,
  waitFor,
  writeFakeAdapterCommand,
} from '../scripts/lib/agentmemory-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dshBin = resolveDsh('AgentMemory clean-profile acceptance');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-clean-profile.'));

try {
  const store = path.join(work, 'store.json');
  const command = await writeFakeAdapterCommand(path.join(work, 'bin'), store);
  const pattern = store;
  const cache = path.join(work, 'npm-cache');
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', work],
    { cwd: path.join(root, 'packages', 'dsh-agentmemory') },
  );
  const tarball = path.join(work, JSON.parse(stdout)[0].filename);
  const env = agentmemoryEnv(command, { DSH_HOME: path.join(work, 'dsh-home') });

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
    assert.equal((dumped.stdout.match(/id: mcp-agentmemory\b/g) ?? []).length, 1, profile);
    assert.match(dumped.stdout, /serverName: agentmemory/);
  }

  const child = spawn(dshBin, ['--profile', 'web', '--port', '0'], {
    cwd: work,
    env: toolEnv(env),
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
    const pids = await waitFor(async () => {
      const found = await pidsMatching(pattern);
      return found.length > 0 ? found : null;
    }, 30000, `clean-profile agentmemory child; output=${output.slice(-500)}`);
    assert.ok(!pids.includes(child.pid), 'refusing to treat the dsh pid as the provider');
  } finally {
    await stopProcessGroup(child);
  }
  await waitFor(async () => (await pidsMatching(pattern)).length === 0, 10000, 'provider cleanup');

  for (const profile of ['web', 'headless']) {
    const removed = await runDsh(
      dshBin,
      ['plugin', '--profile', profile, 'remove', '@dff652/dsh-agentmemory'],
      env,
      work,
      120000,
    );
    assert.equal(removed.code, 0, `${profile} remove: ${removed.stdout}\n${removed.stderr}`);
    const after = await runDsh(dshBin, ['--profile', profile, '--dump-config'], env, work);
    assert.equal(after.code, 0, after.stderr);
    assert.doesNotMatch(after.stdout, /id: mcp-agentmemory\b/);
  }
  assert.deepEqual(await pidsMatching(pattern), []);

  console.log(
    'AgentMemory clean-profile checks: PASS (web/headless install once, start, remove, no leftover child)',
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
