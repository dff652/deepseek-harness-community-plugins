import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  McpClient,
  seedStore,
  startFakeSession,
  writeFakeAdapterCommand,
} from '../scripts/lib/agentmemory-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'packages', 'dsh-agentmemory');
const execFileAsync = promisify(execFile);
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

const PACKED_FILES = [
  'LICENSE',
  'README.md',
  'cordis.patch.yml',
  'index.js',
  'package.json',
];

function fakeProviderSource(recallReport, { ignoreSigterm = false, stderr = '' } = {}) {
  return [
    "const readline = require('node:readline');",
    `const tools = ${JSON.stringify(EXPECTED_TOOLS)};`,
    `const recallReport = ${JSON.stringify(recallReport)};`,
    `if (${JSON.stringify(ignoreSigterm)}) { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }`,
    `if (${JSON.stringify(stderr)}) process.stderr.write(${JSON.stringify(stderr)});`,
    "const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');",
    "const input = readline.createInterface({ input: process.stdin });",
    "input.on('line', (line) => {",
    '  const request = JSON.parse(line);',
    "  if (request.method === 'initialize') send(request.id, { protocolVersion: '2024-11-05', serverInfo: { name: 'fake-agentmemory', version: 'test' } });",
    "  else if (request.method === 'tools/list') send(request.id, { tools: tools.map((name) => ({ name, inputSchema: { type: 'object', properties: { project: { type: 'string' } } } })) });",
    "  else if (request.method === 'tools/call' && request.params.name === 'memory_diagnose') send(request.id, { content: [{ type: 'text', text: JSON.stringify({ summary: { fail: 0, pass: 1, warning: 0 } }) }] });",
    "  else if (request.method === 'tools/call' && request.params.name === 'memory_recall') send(request.id, { content: [{ type: 'text', text: JSON.stringify(recallReport) }] });",
    '});',
  ].join('\n');
}

async function writeBenchmark(cases) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-test-'));
  const benchmark = path.join(directory, 'benchmark.json');
  await writeFileCompat(benchmark, JSON.stringify({ version: 1, cases }));
  return { benchmark, directory };
}

async function writeFileCompat(file, body) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, body, 'utf8');
}

async function runVerifier({
  source,
  benchmark,
  command = process.execPath,
  extra = [],
  timeoutMs = 1000,
}) {
  const args = [verifierPath, '--command', command];
  if (source !== undefined) args.push('--arg', '--eval', '--arg', source);
  if (benchmark) args.push('--benchmark', benchmark);
  args.push('--timeout-ms', String(timeoutMs), ...extra);
  try {
    const result = await execFileAsync(process.execPath, args, { maxBuffer: 1024 * 1024 });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

async function withBenchmark(cases, callback) {
  const { benchmark, directory } = await writeBenchmark(cases);
  try {
    return await callback(benchmark);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('manifest pins the rc.6 MCP client as a peer and exposes only reviewed files', async () => {
  const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));

  assert.equal(manifest.name, '@dff652/dsh-agentmemory');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(
    manifest.repository.url,
    'git+https://github.com/dff652/deepseek-harness-community-plugins.git',
  );
  assert.equal(manifest.repository.directory, 'packages/dsh-agentmemory');
  assert.equal(
    manifest.homepage,
    'https://github.com/dff652/deepseek-harness-community-plugins/tree/main/packages/dsh-agentmemory#readme',
  );
  assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0');
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(manifest.peerDependencies, {
    '@deepseek-ai/dsh-mcp-client': '0.1.0-rc.6',
  });
  assert.deepEqual(manifest.dsh.bundle, { patch: './cordis.patch.yml' });
  assert.deepEqual(manifest.files, ['index.js', 'cordis.patch.yml', 'README.md', 'LICENSE']);
});

test('bundle fails closed and contains no deployment path or secret', async () => {
  const patch = await readFile(path.join(packageDir, 'cordis.patch.yml'), 'utf8');

  assert.match(patch, /id: mcp-agentmemory/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-mcp-client'/);
  assert.match(patch, /serverName: agentmemory/);
  assert.match(patch, /transport: stdio/);
  assert.match(patch, /String\(process\.env\.DSH_AGENTMEMORY_COMMAND \|\| ''\)/);
  assert.match(patch, /DSH_AGENTMEMORY_COMMAND is required/);
  assert.match(patch, /DSH_AGENTMEMORY_COMMAND must be an absolute path/);
  assert.match(patch, /command\.charAt\(0\) !== '\/'/);
  assert.match(patch, /failOnStartupError: true/);
  assert.match(patch, /does not infer one from cwd/);
  assert.match(patch, /Automatic session capture is not started here/);
  assert.doesNotMatch(patch, /^\s+-\s+mcp\s*$/m);
  assert.doesNotMatch(patch, /AGENTMEMORY_SECRET/);
  assert.doesNotMatch(patch, /AGENTMEMORY_URL/);
  assert.doesNotMatch(patch, /\/home\//);
  assert.doesNotMatch(patch, /192\.168\./);
  assert.doesNotMatch(patch, /Bearer\s+/i);
});

test('inert entry copies no handlers and does not claim automatic capture', async () => {
  const entry = await readFile(path.join(packageDir, 'index.js'), 'utf8');
  const readme = await readFile(path.join(packageDir, 'README.md'), 'utf8');

  assert.match(entry, /export function apply\(\) \{\}/);
  assert.match(entry, /Automatic prompt, tool-result and full-session capture/);
  assert.doesNotMatch(entry, /memory_save|createMcpServer|agentmemory-mcp/);
  assert.match(readme, /DSH_AGENTMEMORY_COMMAND/);
  assert.match(readme, /explicit stable `project`/);
  assert.match(readme, /mcp__agentmemory__memory_recall/);
  assert.match(readme, /remain disabled/);
  assert.doesNotMatch(readme, /\/home\//);
  assert.doesNotMatch(readme, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i);
});

test('frozen tool contract is the reviewed eight-tool surface without automatic capture', async () => {
  const fixture = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'agentmemory-tools.json'), 'utf8'),
  );

  assert.equal(fixture.version, 1);
  assert.equal(fixture.serverName, 'agentmemory');
  assert.equal(fixture.automaticSessionCapture, false);
  assert.equal(fixture.requireExplicitProjectOnSave, true);
  assert.deepEqual(fixture.commandArgs, []);
  assert.deepEqual(fixture.tools, EXPECTED_TOOLS);
  assert.equal(fixture.tools.length, 8);
  assert.deepEqual(fixture.acceptedBusinessSurface, ['memory_recall', 'memory_save']);
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('provider identity fixture records reviewed 0.9.28 without machine paths', async () => {
  const identity = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'agentmemory-provider-identity.json'), 'utf8'),
  );

  assert.equal(identity.serverName, 'agentmemory');
  assert.equal(identity.reviewedServerVersion, '0.9.28');
  assert.equal(identity.adapterOwnership, 'deployment');
  assert.equal(identity.automaticSessionCapture, false);
  assert.equal(identity.mcpClient, '0.1.0-rc.6');
  assert.match(identity.identityNote, /does not ship AgentMemory/);
  const serialized = JSON.stringify(identity);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('lifecycle and verifier stay host-gated and do not embed machine paths', async () => {
  const lifecycle = await readFile(
    path.join(root, 'tests', 'dsh-agentmemory-lifecycle.acceptance.mjs'),
    'utf8',
  );
  const activation = await readFile(
    path.join(root, 'tests', 'dsh-agentmemory-activation.acceptance.mjs'),
    'utf8',
  );
  const cleanProfile = await readFile(
    path.join(root, 'tests', 'dsh-agentmemory-clean-profile.acceptance.mjs'),
    'utf8',
  );
  const verifier = await readFile(verifierPath, 'utf8');
  const helper = await readFile(path.join(root, 'scripts', 'lib', 'agentmemory-host.mjs'), 'utf8');
  const fake = await readFile(path.join(root, 'scripts', 'lib', 'agentmemory-fake-stdio.mjs'), 'utf8');

  assert.match(lifecycle, /already in use\|serverName/);
  assert.match(lifecycle, /reconnected agentmemory mcp child/);
  assert.match(lifecycle, /provider cleanup/);
  assert.match(activation, /relative-agentmemory/);
  assert.match(cleanProfile, /dump-config/);
  assert.match(cleanProfile, /@dff652\/dsh-agentmemory/);
  assert.match(verifier, /observation\.content, observation\.text/);
  assert.match(helper, /shell: false|writeFakeAdapterCommand/);
  assert.match(verifier, /memory_diagnose/);
  assert.match(verifier, /memory_recall/);
  assert.match(verifier, /check-save-requires-project/);
  assert.match(fake, /memory_save requires an explicit stable project/);
  assert.doesNotMatch(verifier, /name:\s*['"]memory_save['"][\s\S]*DSH_AGENTMEMORY_PHASE1/);
  assert.doesNotMatch(verifier, /AGENTMEMORY_SECRET/);
  for (const [name, body] of [
    ['lifecycle', lifecycle],
    ['activation', activation],
    ['cleanProfile', cleanProfile],
    ['verifier', verifier],
    ['helper', helper],
    ['fake', fake],
  ]) {
    assert.doesNotMatch(body, /\/home\/dff652/, name);
    assert.doesNotMatch(body, /192\.168\./, name);
    assert.doesNotMatch(body, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i, name);
  }
});

test('recall benchmark contains only synthetic non-secret expectations', async () => {
  const benchmark = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'agentmemory-recall-benchmark.json'), 'utf8'),
  );

  assert.equal(benchmark.version, 1);
  assert.equal(benchmark.cases.length, 3);
  for (const item of benchmark.cases) {
    assert.ok(item.name);
    assert.ok(item.query);
    assert.ok(item.project);
    assert.match(item.expectedObservationId, /^mem_fixture_[a-z0-9_]+$/);
    assert.ok(item.expects.length >= 1);
  }
  const serialized = JSON.stringify(benchmark);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /deepseek-harness-plugins/);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('recall benchmark ignores expected IDs and keywords outside results', async () => {
  const cases = [
    {
      name: 'non-results-decoy',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_expected',
      expects: ['DURABLE_MARKER'],
    },
  ];
  const recallReport = {
    truncated: false,
    debug: 'DURABLE_MARKER',
    expectedObservationId: 'mem_expected',
    hits: [{ observation: { id: 'mem_expected', content: 'DURABLE_MARKER' } }],
    observation: { id: 'mem_expected', content: 'DURABLE_MARKER' },
    results: [
      {
        observation: {
          id: 'mem_other',
          type: 'decision',
          content: 'unrelated text',
          decoy: 'DURABLE_MARKER mem_expected',
        },
      },
    ],
  };
  await withBenchmark(cases, async (benchmark) => {
    const result = await runVerifier({
      source: fakeProviderSource(recallReport),
      benchmark,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /expected observation mem_expected in top-5/);
    assert.doesNotMatch(result.stderr, /Unhandled 'error' event/);
  });
});

test('recall benchmark rejects keywords stuffed only in non-content observation fields', async () => {
  const cases = [
    {
      name: 'decoy-field',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_expected',
      expects: ['DURABLE_MARKER'],
    },
  ];
  const recallReport = {
    truncated: false,
    results: [
      {
        observation: {
          id: 'mem_expected',
          type: 'decision',
          content: 'unrelated text',
          decoy: 'DURABLE_MARKER',
        },
      },
    ],
  };
  await withBenchmark(cases, async (benchmark) => {
    const result = await runVerifier({
      source: fakeProviderSource(recallReport),
      benchmark,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /missed expected values in the matched observation/);
  });
});

test('recall benchmark rejects a cross-observation false PASS', async () => {
  const cases = [
    {
      name: 'cross-observation',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_expected',
      expects: ['DURABLE_MARKER'],
    },
  ];
  const recallReport = {
    truncated: false,
    results: [
      { observation: { id: 'mem_expected', type: 'decision', content: 'unrelated text' } },
      { observation: { id: 'mem_other', type: 'decision', content: 'DURABLE_MARKER' } },
    ],
  };
  await withBenchmark(cases, async (benchmark) => {
    const result = await runVerifier({
      source: fakeProviderSource(recallReport),
      benchmark,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /missed expected values in the matched observation/);
  });
});

test('recall benchmark rejects an expected observation outside the top five', async () => {
  const cases = [
    {
      name: 'top-five',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_sixth',
      expects: ['DURABLE_MARKER'],
    },
  ];
  const recallReport = {
    truncated: false,
    results: [
      ...Array.from({ length: 5 }, (_, index) => ({
        observation: { id: `mem_other_${index}`, type: 'decision', content: 'other' },
      })),
      { observation: { id: 'mem_sixth', type: 'decision', content: 'DURABLE_MARKER' } },
    ],
  };
  await withBenchmark(cases, async (benchmark) => {
    const result = await runVerifier({
      source: fakeProviderSource(recallReport),
      benchmark,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /expected observation mem_sixth in top-5/);
  });
});

test('recall benchmark rejects truncated results', async () => {
  const cases = [
    {
      name: 'truncated',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_expected',
      expects: ['DURABLE_MARKER'],
    },
  ];
  const recallReport = {
    truncated: true,
    results: [{ observation: { id: 'mem_expected', type: 'decision', content: 'DURABLE_MARKER' } }],
  };
  await withBenchmark(cases, async (benchmark) => {
    const result = await runVerifier({
      source: fakeProviderSource(recallReport),
      benchmark,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /must explicitly report truncated: false/);
  });
});

test('recall benchmark rejects missing or non-boolean truncation state', async () => {
  const cases = [
    {
      name: 'truncation-state',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_expected',
      expects: ['DURABLE_MARKER'],
    },
  ];
  for (const truncated of [undefined, 'false']) {
    const recallReport = {
      results: [{ observation: { id: 'mem_expected', type: 'decision', content: 'DURABLE_MARKER' } }],
    };
    if (truncated !== undefined) recallReport.truncated = truncated;
    await withBenchmark(cases, async (benchmark) => {
      const result = await runVerifier({
        source: fakeProviderSource(recallReport),
        benchmark,
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /must explicitly report truncated: false/);
    });
  }
});

test('missing MCP executable fails cleanly instead of throwing an unhandled spawn error', async () => {
  const result = await runVerifier({ command: '/tmp/dsh-agentmemory-does-not-exist' });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /FAIL: spawn .*ENOENT/);
  assert.doesNotMatch(result.stderr, /Unhandled 'error' event/);
});

test('provider stderr is summarized and an ignored SIGTERM escalates to confirmed SIGKILL', async () => {
  const cases = [
    {
      name: 'cleanup',
      query: 'marker',
      project: 'public-agentmemory-canary',
      expectedObservationId: 'mem_expected',
      expects: ['DURABLE_MARKER'],
    },
  ];
  const recallReport = {
    truncated: false,
    results: [{ observation: { id: 'mem_expected', type: 'decision', content: 'DURABLE_MARKER' } }],
  };
  await withBenchmark(cases, async (benchmark) => {
    const result = await runVerifier({
      source: fakeProviderSource(recallReport, {
        ignoreSigterm: true,
        stderr: 'DSH_REVIEW_FAKE_SECRET_MARKER\n',
      }),
      benchmark,
    });
    assert.equal(result.code, 0);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.processCleanup, { exited: true, termination: 'SIGKILL' });
    assert.match(result.stderr, /provider stderr summary/);
    assert.match(result.stderr, /redacted/);
    assert.doesNotMatch(result.stderr, /DSH_REVIEW_FAKE_SECRET_MARKER/);
  });
});

test('conforming adapter rejects save without project and isolates recall by project', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-isolation.'));
  try {
    const store = path.join(work, 'store.json');
    await seedStore(store, [
      {
        id: 'mem_fixture_seed',
        project: 'keep',
        content: 'preexisting seed',
      },
    ]);
    const before = await readFile(store, 'utf8');
    const command = await writeFakeAdapterCommand(work, store);
    const { client, tools } = await startFakeSession(command);
    try {
      assert.deepEqual([...tools].sort(), EXPECTED_TOOLS);
      const denied = await client.request('tools/call', {
        name: 'memory_save',
        arguments: { content: 'must-not-write' },
      });
      assert.equal(denied.isError, true);
      assert.match(denied.content[0].text, /explicit stable project/);
      assert.equal(await readFile(store, 'utf8'), before);

      const saved = await client.request('tools/call', {
        name: 'memory_save',
        arguments: {
          content: 'PUBLIC_AM_ISOLATION_MARKER',
          project: 'project-alpha',
          type: 'decision',
        },
      });
      assert.equal(saved.isError, undefined);
      const leaked = await client.request('tools/call', {
        name: 'memory_recall',
        arguments: { query: 'PUBLIC_AM_ISOLATION_MARKER', project: 'project-beta', limit: 5 },
      });
      const leakedBody = JSON.parse(leaked.content[0].text);
      assert.equal(leakedBody.truncated, false);
      assert.equal(leakedBody.results.length, 0);

      const scoped = await client.request('tools/call', {
        name: 'memory_recall',
        arguments: { query: 'PUBLIC_AM_ISOLATION_MARKER', project: 'project-alpha', limit: 5 },
      });
      const scopedBody = JSON.parse(scoped.content[0].text);
      assert.equal(scopedBody.truncated, false);
      assert.equal(scopedBody.results[0].observation.project, 'project-alpha');
      assert.match(scopedBody.results[0].observation.content, /PUBLIC_AM_ISOLATION_MARKER/);
    } finally {
      await client.close();
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('cross-session marker recall returns rank 1 with truncated false', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-cross-session.'));
  try {
    const store = path.join(work, 'store.json');
    const command = await writeFakeAdapterCommand(work, store);
    const first = new McpClient(command, [], process.env);
    let observationId;
    try {
      await first.initialize({ name: 'dsh-agentmemory-host', version: '0.1.0' });
      const saved = await first.request('tools/call', {
        name: 'memory_save',
        arguments: {
          content: 'PUBLIC_AM_CROSS_SESSION_MARKER',
          project: 'public-agentmemory-canary',
          type: 'decision',
        },
      });
      observationId = JSON.parse(saved.content[0].text).id;
    } finally {
      await first.close();
    }

    const result = await runVerifier({
      command,
      extra: [
        '--project',
        'public-agentmemory-canary',
        '--query',
        'PUBLIC_AM_CROSS_SESSION_MARKER',
        '--expect',
        'PUBLIC_AM_CROSS_SESSION_MARKER',
        '--check-save-requires-project',
      ],
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.toolCount, 8);
    assert.equal(report.checks.saveRequiresProject, 'PASS');
    assert.equal(report.benchmarks[0].truncated, false);
    assert.equal(report.benchmarks[0].matches[0].rank, 1);
    assert.equal(report.benchmarks[0].matches[0].observationId, observationId);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('synthetic recall benchmark is 3/3 at rank 1 against a conforming adapter', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-benchmark.'));
  try {
    const store = path.join(work, 'store.json');
    await seedStore(store, [
      {
        id: 'mem_fixture_rank_one',
        project: 'public-agentmemory-canary',
        content: 'PUBLIC_AM_RANK_MARKER',
      },
      {
        id: 'mem_fixture_project_scope',
        project: 'public-agentmemory-canary',
        content: 'PUBLIC_AM_PROJECT_MARKER explicit project scope',
      },
      {
        id: 'mem_fixture_cross_session',
        project: 'public-agentmemory-canary',
        content: 'PUBLIC_AM_CROSS_SESSION_MARKER',
      },
      {
        id: 'mem_fixture_other_project',
        project: 'other-canary',
        content: 'PUBLIC_AM_RANK_MARKER from another project',
      },
    ]);
    const command = await writeFakeAdapterCommand(work, store);
    const result = await runVerifier({
      command,
      extra: ['--benchmark', path.join(root, 'tests', 'fixtures', 'agentmemory-recall-benchmark.json')],
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.benchmarkSummary, {
      caseCount: 3,
      passed: 3,
      rank1Evaluated: 3,
      expectedAtRank1: 3,
      expectedWithinTop5: 3,
    });
    assert.ok(report.benchmarks.every((item) => item.truncated === false));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('npm pack dry-run ships only the declared allowlist', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-public-npm-cache.'));
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache],
      { cwd: packageDir },
    );
    const reports = JSON.parse(stdout);
    const files = reports[0].files.map((item) => item.path).sort();
    assert.deepEqual(files, PACKED_FILES);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});

test('two clean packs are byte-identical and unpack to the allowlist', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agentmemory-dual-pack.'));
  try {
    const hashes = [];
    for (const label of ['a', 'b']) {
      const cache = path.join(work, `cache-${label}`);
      const dest = path.join(work, `dest-${label}`);
      await mkdir(dest, { recursive: true });
      const { stdout } = await execFileAsync(
        'npm',
        ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', dest],
        { cwd: packageDir, env: { ...process.env, SOURCE_DATE_EPOCH: '1704067200' } },
      );
      const filename = JSON.parse(stdout)[0].filename;
      const tarball = path.join(dest, filename);
      hashes.push(sha256(await readFile(tarball)));
      const { stdout: listing } = await execFileAsync('tar', ['-tzf', tarball]);
      const files = listing
        .split('\n')
        .filter(Boolean)
        .map((entry) => entry.replace(/^package\//, ''))
        .filter((entry) => entry && entry !== '.')
        .sort();
      assert.deepEqual(files, PACKED_FILES);
    }
    assert.equal(hashes[0], hashes[1]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('consumer tarball install instructions use the DSH workspace root', async () => {
  const documents = [
    path.join(root, 'README.md'),
    path.join(root, 'docs', 'install-upgrade-rollback.md'),
    path.join(packageDir, 'README.md'),
  ];

  for (const file of documents) {
    const text = await readFile(file, 'utf8');
    const addCommands = text.split(/\r?\n/).filter((line) => /dsh plugin .* add /.test(line));
    assert.ok(addCommands.length > 0, `${path.relative(root, file)} has no install command`);
    for (const command of addCommands) {
      assert.match(command, / add -w /, `${path.relative(root, file)}: ${command}`);
    }
  }
});
