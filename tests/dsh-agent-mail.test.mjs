import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'packages', 'dsh-agent-mail');
const execFileAsync = promisify(execFile);

const EXPECTED_TOOLS = [
  'comm_send',
  'comm_inbox',
  'comm_claim',
  'comm_ack',
  'comm_list_agents',
  'comm_approve',
  'comm_reject',
  'comm_approvals',
  'comm_tail',
  'comm_events',
  'comm_diagnose',
];

const PACKED_FILES = [
  'LICENSE',
  'NOTICE',
  'README.md',
  'cordis.patch.yml',
  'index.js',
  'package.json',
];

test('manifest pins the rc.6 MCP client as a peer and exposes only reviewed files', async () => {
  const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));

  assert.equal(manifest.name, '@dff652/dsh-agent-mail');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(
    manifest.repository.url,
    'git+https://github.com/dff652/deepseek-harness-community-plugins.git',
  );
  assert.equal(manifest.repository.directory, 'packages/dsh-agent-mail');
  assert.equal(
    manifest.homepage,
    'https://github.com/dff652/deepseek-harness-community-plugins/tree/main/packages/dsh-agent-mail#readme',
  );
  assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0');
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(manifest.peerDependencies, {
    '@deepseek-ai/dsh-mcp-client': '0.1.0-rc.6',
  });
  assert.deepEqual(manifest.dsh.bundle, { patch: './cordis.patch.yml' });
  assert.deepEqual(manifest.files, [
    'index.js',
    'cordis.patch.yml',
    'README.md',
    'LICENSE',
    'NOTICE',
  ]);
});

test('bundle fails closed and contains no deployment path or secret', async () => {
  const patch = await readFile(path.join(packageDir, 'cordis.patch.yml'), 'utf8');

  assert.match(patch, /id: mcp-agent-mail/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-mcp-client'/);
  assert.match(patch, /serverName: agent-mail/);
  assert.match(patch, /transport: stdio/);
  assert.match(patch, /String\(process\.env\.DSH_AGENT_MAIL_COMMAND \|\| ''\)/);
  assert.match(patch, /DSH_AGENT_MAIL_COMMAND is required/);
  assert.match(patch, /DSH_AGENT_MAIL_COMMAND must be an absolute path/);
  assert.match(patch, /DSH_AGENT_MAIL_HOME is required/);
  assert.match(patch, /DSH_AGENT_MAIL_HOME must be an absolute path/);
  assert.match(patch, /DSH_AGENT_MAIL_ID is required/);
  assert.match(patch, /Harness identity must not be human@local/);
  assert.match(patch, /command\.charAt\(0\) !== '\/'/);
  assert.match(patch, /failOnStartupError: true/);
  assert.match(patch, /does not start a wake runner/);
  assert.doesNotMatch(patch, /^\s+-\s+mcp\s*$/m);
  assert.doesNotMatch(patch, /AGENT_MAIL_HUB_TOKEN/);
  assert.doesNotMatch(patch, /\/home\//);
  assert.doesNotMatch(patch, /192\.168\./);
  assert.doesNotMatch(patch, /Bearer\s+/i);
});

test('inert entry copies no handlers and does not claim automatic wake', async () => {
  const entry = await readFile(path.join(packageDir, 'index.js'), 'utf8');
  const readme = await readFile(path.join(packageDir, 'README.md'), 'utf8');
  const notice = await readFile(path.join(packageDir, 'NOTICE'), 'utf8');

  assert.match(entry, /export function apply\(\) \{\}/);
  assert.match(entry, /Automatic wake/);
  assert.doesNotMatch(entry, /comm_send|createMcpServer|agent-mail-mcp/);
  assert.match(readme, /never `human@local`/);
  assert.match(readme, /token_file/);
  assert.match(readme, /mcp__agent-mail__comm_send/);
  assert.match(readme, /not provided here/);
  assert.match(readme, /Automatic\s+wake/);
  assert.match(notice, /@deepseek-ai\/dsh-mcp-client@0\.1\.0-rc\.6/);
  assert.doesNotMatch(readme, /\/home\//);
  assert.doesNotMatch(readme, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i);
});

test('frozen tool contract is the reviewed eleven-tool surface with gated approval discovery', async () => {
  const fixture = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-tools.json'), 'utf8'),
  );

  assert.equal(fixture.version, 1);
  assert.equal(fixture.serverName, 'agent-mail');
  assert.equal(fixture.autoWake, false);
  assert.deepEqual(fixture.commandArgs, []);
  assert.deepEqual(fixture.tools, EXPECTED_TOOLS);
  assert.equal(fixture.tools.length, 11);
  assert.deepEqual(fixture.humanOnlyTools, ['comm_approve', 'comm_reject']);
  assert.deepEqual(fixture.harnessIdentityForbidden, ['human@local']);
  assert.match(fixture.discoveryNote, /exit_code 6/);
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('provider identity fixture records reviewed alpha.4 without machine paths', async () => {
  const identity = JSON.parse(
    await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-provider-identity.json'), 'utf8'),
  );

  assert.equal(identity.package, 'agent-mail');
  assert.equal(identity.versionLabel, '1.0.0-alpha.4');
  assert.equal(identity.reviewedSource.head, 'ca6601c95eeda2d5d558cca37179be1412b75a8d');
  assert.equal(
    identity.dsh101TarballSha256,
    '925bf5b2371f3a33252af53293a086ce986d1f2558077fb2b6162a726a29d19b',
  );
  assert.equal(
    identity.mcpEntrySha256,
    'c0feeff292ee3b4bba65878174714e24a0dc5b5e53982293eb412da256df999e',
  );
  assert.equal(identity.mcpClient, '0.1.0-rc.6');
  assert.match(identity.identityNote, /Automatic wake is not part of this candidate/);
  const serialized = JSON.stringify(identity);
  assert.doesNotMatch(serialized, /\/home\//);
  assert.doesNotMatch(serialized, /Bearer|credential|access[_-]?token/i);
});

test('lifecycle and verifier stay host-gated and do not embed machine paths', async () => {
  const lifecycle = await readFile(
    path.join(root, 'tests', 'dsh-agent-mail-lifecycle.acceptance.mjs'),
    'utf8',
  );
  const activation = await readFile(
    path.join(root, 'tests', 'dsh-agent-mail-activation.acceptance.mjs'),
    'utf8',
  );
  const verifier = await readFile(path.join(root, 'scripts', 'verify-agent-mail-mcp.mjs'), 'utf8');
  const helper = await readFile(path.join(root, 'scripts', 'lib', 'agent-mail-host.mjs'), 'utf8');

  assert.match(lifecycle, /already in use\|serverName/);
  assert.match(lifecycle, /reconnected agent-mail mcp child/);
  assert.match(lifecycle, /provider cleanup/);
  assert.match(activation, /human@local/);
  assert.match(activation, /relative-mail-home/);
  assert.match(helper, /shell: false/);
  assert.match(verifier, /startSession/);
  assert.match(verifier, /comm_send/);
  assert.match(verifier, /exit_code/);
  assert.match(helper, /DSH_AGENT_MAIL_TARBALL/);
  assert.doesNotMatch(helper, /\/tmp\/dsh101/);
  for (const [name, body] of [
    ['lifecycle', lifecycle],
    ['activation', activation],
    ['verifier', verifier],
    ['helper', helper],
  ]) {
    assert.doesNotMatch(body, /\/home\/dff652/, name);
    assert.doesNotMatch(body, /192\.168\./, name);
    assert.doesNotMatch(body, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i, name);
  }
});

test('npm pack dry-run ships only the declared allowlist', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-public-npm-cache.'));
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
