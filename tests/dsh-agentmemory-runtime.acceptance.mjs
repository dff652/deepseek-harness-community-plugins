import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeActivation } from '../scripts/lib/dsh-activation-probe.mjs';
import { execFileAsync, resolveDsh, runDsh, writeFakeAdapterCommand } from '../scripts/lib/agentmemory-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-runtime.'));
const dshBin = resolveDsh('AgentMemory runtime acceptance');
try {
  const store = path.join(work, 'store.json');
  const command = await writeFakeAdapterCommand(path.join(work, 'bin'), store);
  const env = { ...process.env, DSH_HOME: path.join(work, 'home'), DSH_AGENTMEMORY_COMMAND: command };
  const packed = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], {
    cwd: path.join(root, 'packages', 'dsh-agentmemory'),
  });
  const tarball = path.join(work, JSON.parse(packed.stdout)[0].filename);
  const installed = await runDsh(dshBin, ['plugin', '--profile', 'web', 'add', '-w', tarball], env, work, 120000);
  assert.equal(installed.code, 0, installed.stderr);
  const result = await probeActivation(dshBin, [], env, work, ['mcp-agentmemory'], {
    expectFailure: false,
    calls: [
      { name: 'mcp__agentmemory__memory_save', arguments: { content: 'runtime project A canary', project: 'runtime-project-a' } },
      { name: 'mcp__agentmemory__memory_save', arguments: { content: 'runtime project B decoy', project: 'runtime-project-b' } },
      { name: 'mcp__agentmemory__memory_recall', arguments: { query: 'runtime', project: 'runtime-project-a', limit: 10 } },
      { name: 'mcp__agentmemory__memory_save', arguments: { content: 'implicit project must fail' } },
    ],
  });
  assert.equal(result.rows[0].state, 2);
  const fixture = JSON.parse(await readFile(path.join(root, 'tests', 'fixtures', 'agentmemory-tools.json')));
  assert.deepEqual(result.tools.filter(name => name.startsWith('mcp__agentmemory__')).sort(),
    fixture.tools.map(name => `mcp__agentmemory__${name}`).sort());
  assert.ok(result.results.slice(0, 3).every(outcome => !outcome.isError));
  const recalled = JSON.parse(result.results[2].value.content[0].text).results;
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].observation.project, 'runtime-project-a');
  assert.equal(result.results[3].isError, true);
  assert.match(result.results[3].error.message, /explicit stable project/);
  const observations = JSON.parse(await readFile(store, 'utf8')).observations;
  assert.equal(observations.length, 2, 'rejected save must not write a third observation');
  console.log('AgentMemory packed runtime: PASS (8 tools, scoped save/recall, implicit-project rejection)');
} finally {
  await rm(work, { recursive: true, force: true });
}
