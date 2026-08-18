import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileAsync, McpClient } from '../scripts/lib/agentmemory-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifierPath = path.join(root, 'scripts', 'verify-agentmemory-mcp.mjs');
const EXPECTED_TOOLS = [
  'memory_consolidate',
  'memory_diagnose',
  'memory_lesson_save',
  'memory_recall',
  'memory_reflect',
  'memory_save',
  'memory_sessions',
  'memory_smart_search',
];

function resolveCommand() {
  const command = String(process.env.DSH_AGENTMEMORY_COMMAND || '').trim();
  if (!command) {
    throw new Error(
      'AgentMemory real MCP acceptance requires DSH_AGENTMEMORY_COMMAND as an absolute path',
    );
  }
  if (!command.startsWith('/')) {
    throw new Error('DSH_AGENTMEMORY_COMMAND must be an absolute path');
  }
  return command;
}

function textFromResult(result) {
  return (result?.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}

function parseBody(result) {
  const text = textFromResult(result);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('provider returned non-JSON tool output');
  }
}

function savedObservationId(body) {
  return (
    body.memory?.id ??
    body.id ??
    body.memory_id ??
    body.observation?.id ??
    body.result?.id ??
    null
  );
}

const command = resolveCommand();
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-real-mcp.'));
const project = 'dsh-public-bundle-canary';
const runId = `PUBAM_${Date.now().toString(36)}`;
const cases = [
  {
    name: 'rank-one-marker',
    query: `${runId}_RANK`,
    expect: `${runId}_RANK narrative`,
  },
  {
    name: 'project-scoped-marker',
    query: `${runId}_PROJECT`,
    expect: `${runId}_PROJECT explicit project scope`,
  },
  {
    name: 'cross-session-marker',
    query: `${runId}_SESSION`,
    expect: `${runId}_SESSION durable`,
  },
];

try {
  const first = new McpClient(command, [], process.env, 20000);
  const saved = [];
  try {
    const initialized = await first.initialize({
      name: 'dsh-agentmemory-real',
      version: '0.1.0',
    });
    assert.equal(initialized.serverInfo?.name, 'agentmemory');
    assert.equal(initialized.serverInfo?.version, '0.9.28');
    const listed = await first.request('tools/list');
    const tools = (listed.tools ?? []).map((tool) => tool.name).sort();
    assert.deepEqual(tools, EXPECTED_TOOLS);
    const recall = listed.tools.find((tool) => tool.name === 'memory_recall');
    const save = listed.tools.find((tool) => tool.name === 'memory_save');
    assert.ok(recall?.inputSchema?.properties?.project, 'memory_recall schema must declare project');
    assert.ok(save?.inputSchema?.properties?.project, 'memory_save schema must declare project');
    assert.ok(
      Array.isArray(save.inputSchema.required) && save.inputSchema.required.includes('project'),
    );

    const denied = await first.request('tools/call', {
      name: 'memory_save',
      arguments: { content: `${runId}_MUST_NOT_PERSIST` },
    });
    assert.equal(denied.isError, true, 'memory_save without project must fail closed');

    for (const item of cases) {
      const wrote = await first.request('tools/call', {
        name: 'memory_save',
        arguments: {
          content: item.expect,
          project,
          type: 'decision',
        },
      });
      assert.notEqual(wrote.isError, true, `${item.name} save failed: ${textFromResult(wrote)}`);
      const id = savedObservationId(parseBody(wrote));
      assert.match(String(id ?? ''), /^mem_[a-z0-9_]+$/i, `${item.name} save must return an id`);
      saved.push({ ...item, expectedObservationId: id, project, expects: [item.expect] });
    }

    const decoy = await first.request('tools/call', {
      name: 'memory_save',
      arguments: {
        content: `${runId}_RANK narrative from another project`,
        project: 'dsh-public-bundle-other',
        type: 'decision',
      },
    });
    assert.notEqual(decoy.isError, true, `decoy save failed: ${textFromResult(decoy)}`);
    const decoyId = savedObservationId(parseBody(decoy));
    assert.match(String(decoyId ?? ''), /^mem_[a-z0-9_]+$/i, 'decoy save must return an id');
    saved[0].forbiddenObservationIds = [decoyId];
  } finally {
    await first.close();
  }

  const benchmark = path.join(work, 'benchmark.json');
  await writeFile(benchmark, `${JSON.stringify({ version: 1, cases: saved }, null, 2)}\n`);
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      verifierPath,
      '--command',
      command,
      '--benchmark',
      benchmark,
      '--check-save-requires-project',
      '--timeout-ms',
      '20000',
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const report = JSON.parse(stdout);
  assert.equal(report.status, 'PASS', stderr);
  assert.equal(report.server?.version, '0.9.28');
  assert.equal(report.toolCount, 8);
  assert.equal(report.checks.saveRequiresProject, 'PASS');
  assert.deepEqual(report.benchmarkSummary, {
    caseCount: 3,
    passed: 3,
    rank1Evaluated: 3,
    expectedAtRank1: 3,
    expectedWithinTop5: 3,
  });
  assert.ok(report.benchmarks.every((item) => item.truncated === false));
  assert.ok(report.benchmarks.every((item) => item.projectRequested === project));
  assert.doesNotMatch(stderr, /Unhandled 'error' event/);
  console.log(
    JSON.stringify({
      status: 'PASS',
      server: report.server,
      toolCount: report.toolCount,
      diagnosis: report.diagnosis,
      benchmarkSummary: report.benchmarkSummary,
      truncated: report.benchmarks.map((item) => item.truncated),
      project: project,
    }),
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
