import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'packages', 'dsh-ai-asset-hub');
const execFileAsync = promisify(execFile);

const EXPECTED_TOOLS = [
  'aiah_asset_status',
  'aiah_diff',
  'aiah_doctor',
  'aiah_migration_readiness',
  'aiah_migration_status',
  'aiah_scan',
  'aiah_validate',
  'aiah_version',
];

test('manifest pins the rc.6 MCP client as a peer and exposes only reviewed files', async () => {
  const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));

  assert.equal(manifest.name, '@dff652/dsh-ai-asset-hub');
  assert.equal(manifest.version, '0.1.1');
  assert.equal(manifest.private, undefined);
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

  assert.match(patch, /id: mcp-aiah/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-mcp-client'/);
  assert.match(patch, /serverName: aiah/);
  assert.match(patch, /transport: stdio/);
  assert.match(patch, /String\(process\.env\.DSH_AIAH_COMMAND \|\| ''\)/);
  assert.match(patch, /DSH_AIAH_COMMAND is required/);
  assert.match(patch, /DSH_AIAH_COMMAND must be an absolute path/);
  assert.match(patch, /command\.charAt\(0\) !== '\/'/);
  assert.match(patch, /failOnStartupError: true/);
  assert.match(patch, /^\s+-\s+mcp\s*$/m);
  assert.doesNotMatch(patch, /\/home\//);
  assert.doesNotMatch(patch, /192\.168\./);
  assert.doesNotMatch(patch, /Bearer\s+/i);
  assert.doesNotMatch(patch, /AIAH_SECRET\s*:/);
});

test('frozen tool contract is exactly the reviewed eight-tool read-only surface', async () => {
  const fixture = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'aiah-tools.json'), 'utf8'),
  );

  assert.equal(fixture.version, 1);
  assert.equal(fixture.serverName, 'aiah');
  assert.equal(fixture.commandArg, 'mcp');
  assert.deepEqual(fixture.tools, EXPECTED_TOOLS);
  assert.equal(fixture.tools.length, 8);
  for (const name of fixture.forbiddenTools) {
    assert.ok(!fixture.tools.includes(name), name);
  }
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('provider identity fixture records the official v0.1.11 Release binary', async () => {
  const identity = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'aiah-provider-identity.json'), 'utf8'),
  );

  assert.equal(identity.releaseTag, 'v0.1.11');
  assert.equal(identity.releaseCommit, '54a77e8a344618f7aa7fc69ba55caffaba985371');
  assert.equal(identity.selfReportedVersion, '0.1.11');
  assert.equal(
    identity.linuxAmd64.sha256,
    '6836c21f5fe129d2a36ddaa6635b6b9e08bcd442576eabb9de5e93b11ba92ed8',
  );
  const serialized = JSON.stringify(identity);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('lifecycle acceptance stays host-gated and does not embed machine paths', async () => {
  const lifecycle = await readFile(
    path.join(root, 'tests', 'dsh-ai-asset-hub-lifecycle.acceptance.mjs'),
    'utf8',
  );

  assert.match(lifecycle, /already in use\|serverName/);
  assert.match(lifecycle, /reconnected aiah mcp child/);
  assert.match(lifecycle, /provider cleanup/);
  assert.match(lifecycle, /shell: false|spawn\(dshBin/);
  assert.doesNotMatch(lifecycle, /\/home\/dff652/);
  assert.doesNotMatch(lifecycle, /192\.168\./);
});

test('read-only verifier keeps process launch argv-based and never exposes writers', async () => {
  const verifier = await readFile(path.join(root, 'scripts', 'verify-aiah-mcp.mjs'), 'utf8');

  assert.match(verifier, /shell: false/);
  assert.match(verifier, /aiah_asset_status/);
  assert.match(verifier, /aiah_version/);
  assert.match(verifier, /zero-write|zeroWrite|snapshotTree/);
  assert.doesNotMatch(verifier, /name:\s*['"]aiah_apply/);
  assert.doesNotMatch(verifier, /name:\s*['"]aiah_build/);
  assert.doesNotMatch(verifier, /name:\s*['"]aiah_rollback/);
  assert.doesNotMatch(verifier, /\/home\/dff652/);
  assert.doesNotMatch(verifier, /AIAH_SECRET/);
});

test('npm pack dry-run ships only the declared allowlist', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-public-npm-cache.'));
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache],
      { cwd: packageDir },
    );
    const reports = JSON.parse(stdout);
    const files = reports[0].files.map((item) => item.path).sort();
    assert.deepEqual(files, ['LICENSE', 'README.md', 'cordis.patch.yml', 'index.js', 'package.json']);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});
