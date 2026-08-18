import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanner = path.join(root, 'scripts', 'check-public-repo.mjs');
const execFileAsync = promisify(execFile);

async function makeFixture() {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-public-boundary.'));
  await mkdir(path.join(fixture, 'scripts'));
  await copyFile(scanner, path.join(fixture, 'scripts', 'check-public-repo.mjs'));
  await writeFile(path.join(fixture, 'README.md'), '# Safe fixture\n', 'utf8');
  return fixture;
}

async function runScanner(fixture) {
  try {
    const result = await execFileAsync(process.execPath, ['scripts/check-public-repo.mjs'], {
      cwd: fixture,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }
}

test('public boundary scanner accepts a safe source tree', async () => {
  const fixture = await makeFixture();
  try {
    const result = await runScanner(fixture);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /PASS/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public boundary scanner rejects a private marker without echoing it', async () => {
  const fixture = await makeFixture();
  const marker = ['192', '168', '244', '199'].join('.');
  try {
    await writeFile(path.join(fixture, 'unsafe.txt'), `${marker}\n`, 'utf8');
    const result = await runScanner(fixture);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /unsafe\.txt: private IPv4 address/);
    assert.doesNotMatch(result.stderr, new RegExp(marker.replaceAll('.', '\\.')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public boundary scanner rejects symbolic links', async () => {
  const fixture = await makeFixture();
  try {
    await symlink('README.md', path.join(fixture, 'linked-readme'));
    const result = await runScanner(fixture);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /linked-readme: unsupported filesystem entry/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public boundary scanner rejects credential and cross-platform path canaries', async () => {
  const windowsSeparator = String.fromCharCode(92);
  const forwardSeparator = '/';
  const cases = [
    ['json-secret.txt', `{"token":"${'s'.repeat(16)}"}\n`, /assigned secret/],
    ['file-uri.txt', `${['file:', '', '', 'home', 'example', 'private'].join('/')}\n`, /file URI path/],
    ['windows-drive.txt', `${['C:', 'private', 'secret.txt'].join(windowsSeparator)}\n`, /Windows drive path/],
    ['windows-drive-forward.txt', `${['C:', 'private', 'secret.txt'].join(forwardSeparator)}\n`, /Windows drive path/],
    ['windows-unc.txt', `${['', '', 'server', 'share', 'secret.txt'].join(windowsSeparator)}\n`, /Windows UNC path/],
    ['windows-unc-forward.txt', `${['', '', 'server', 'share', 'secret.txt'].join(forwardSeparator)}\n`, /Windows UNC path/],
    ['windows-file-uri.txt', `${['file:', '', '', 'C:', 'private', 'secret.txt'].join(forwardSeparator)}\n`, /file URI path/],
    ['unc-file-uri.txt', `${['file:', '', 'server', 'share', 'private', 'secret.txt'].join(forwardSeparator)}\n`, /file URI path/],
  ];

  for (const [name, body, expected] of cases) {
    const fixture = await makeFixture();
    try {
      await writeFile(path.join(fixture, name), body, 'utf8');
      const result = await runScanner(fixture);
      assert.notEqual(result.code, 0, `${name} unexpectedly passed`);
      assert.match(result.stderr, expected);
      assert.doesNotMatch(result.stderr, /s{16}|private\\secret|server\\share/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test('public boundary scanner rejects a private AgentMemory data path without echoing it', async () => {
  const fixture = await makeFixture();
  const marker = [String.fromCharCode(46), 'agentmemory'].join('');
  try {
    await writeFile(path.join(fixture, 'memory-home.txt'), `${marker}/\n`, 'utf8');
    const result = await runScanner(fixture);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /memory-home\.txt: private AgentMemory data path/);
    assert.doesNotMatch(result.stderr, new RegExp(marker.replaceAll('.', '\\.')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public boundary scanner rejects an assigned AgentMemory secret without echoing it', async () => {
  const fixture = await makeFixture();
  const secret = `amsec_${'x'.repeat(16)}`;
  try {
    await writeFile(path.join(fixture, 'memory-secret.txt'), `AGENTMEMORY_SECRET=${secret}\n`, 'utf8');
    const result = await runScanner(fixture);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /memory-secret\.txt: assigned AgentMemory secret/);
    assert.doesNotMatch(result.stderr, new RegExp(secret));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public boundary scanner rejects a private Agent Mail data path without echoing it', async () => {
  const fixture = await makeFixture();
  const marker = [String.fromCharCode(46), 'agent', '-', 'mail'].join('');
  try {
    await writeFile(path.join(fixture, 'mail-home.txt'), `${marker}/\n`, 'utf8');
    const result = await runScanner(fixture);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /mail-home\.txt: private Agent Mail data path/);
    assert.doesNotMatch(result.stderr, new RegExp(`${marker.replaceAll('.', '\\.')}`));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public boundary scanner rejects binary package artifacts', async () => {
  const cases = [
    ['nul-binary.tgz', Buffer.from([0x1f, 0x8b, 0x00, 0x01])],
    ['non-utf8-binary.tgz', Buffer.from([0xff, 0xfe, 0xfd, 0xfc])],
  ];
  for (const [name, body] of cases) {
    const fixture = await makeFixture();
    try {
      await writeFile(path.join(fixture, name), body);
      const result = await runScanner(fixture);
      assert.notEqual(result.code, 0, `${name} unexpectedly passed`);
      assert.match(result.stderr, new RegExp(`${name.replace('.', '\\.')}: unreviewed binary content`));
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }
});
