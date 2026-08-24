import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  EXPECTED,
  execute,
  exitCodeForStatus,
  invalidateReport,
  packageListHasExactIdentity,
  parseArguments,
  requirePathAbsent,
  validateCatalog,
  verifyDisposableProfile,
  writeReportAtomic,
} from '../scripts/verify-aiah-marketplace.mjs';

const execFileAsync = promisify(execFile);
const verifier = fileURLToPath(new URL('../scripts/verify-aiah-marketplace.mjs', import.meta.url));

function entry(overrides = {}) {
  return {
    name: EXPECTED.name,
    owner: EXPECTED.owner,
    url: EXPECTED.url,
    page: EXPECTED.page,
    category: EXPECTED.category,
    description: EXPECTED.description,
    npm: null,
    tarball: EXPECTED.tarball,
    install: `dsh plugin --profile web add "${EXPECTED.tarball}"`,
    added: '2026-08-24',
    ...overrides,
  };
}

function catalog(plugins = [entry()]) {
  return { updated: '2026-08-24T04:03:00Z', count: plugins.length, plugins };
}

test('marketplace validator accepts the exact post-merge listing', () => {
  const result = validateCatalog(catalog());
  assert.equal(result.entry.tarball, EXPECTED.tarball);
  assert.equal(result.catalogCount, 1);
});

test('marketplace validator rejects duplicate identity matches', () => {
  assert.throws(
    () => validateCatalog(catalog([entry(), entry({ url: 'https://example.invalid/alias' })])),
    /exactly one AIAH marketplace entry/,
  );
});

test('marketplace validator rejects identity, description and artifact drift', () => {
  for (const changed of [
    { owner: 'someone-else' },
    { description: { ...EXPECTED.description, en: 'drifted' } },
    { tarball: 'https://example.invalid/wrong.tgz' },
    { npm: '@dff652/dsh-ai-asset-hub' },
  ]) {
    assert.throws(() => validateCatalog(catalog([entry(changed)])));
  }
});

test('marketplace validator rejects a mismatched catalog count', () => {
  assert.throws(() => validateCatalog({ ...catalog(), count: 2 }), /catalog.count/);
});

test('CLI modes fail closed unless listing-only or all runtime inputs are explicit', async () => {
  assert.throws(() => parseArguments([]), /full verification requires/);
  assert.throws(() => parseArguments(['--dsh-bin', '/bin/dsh']), /must be supplied together/);
  assert.throws(
    () => parseArguments([
      '--listing-only',
      '--dsh-bin', '/bin/dsh',
      '--aiah-command', '/bin/aiah',
      '--pnpm-cli', '/bin/pnpm',
    ]),
    /cannot be combined/,
  );

  const listing = { count: 1, artifact: { sha256: EXPECTED.sha256 } };
  const listingOnly = await execute(['--listing-only'], {
    verifyListing: async () => ({ listing, artifact: Buffer.alloc(0) }),
    verifyDisposableProfile: async () => assert.fail('listing-only must not install'),
  });
  assert.equal(listingOnly.status, 'NOT_COVERED');
  assert.equal(exitCodeForStatus(listingOnly.status), 2);

  const full = await execute([
    '--dsh-bin', '/bin/dsh',
    '--aiah-command', '/bin/aiah',
    '--pnpm-cli', '/bin/pnpm',
  ], {
    verifyListing: async () => ({ listing, artifact: Buffer.alloc(0) }),
    verifyDisposableProfile: async () => ({ status: 'PASS' }),
  });
  assert.equal(full.status, 'PASS');
  assert.equal(exitCodeForStatus(full.status), 0);
  await assert.rejects(
    execute([
      '--dsh-bin', '/bin/dsh',
      '--aiah-command', '/bin/aiah',
      '--pnpm-cli', '/bin/pnpm',
    ], {
      verifyListing: async () => ({ listing, artifact: Buffer.alloc(0) }),
      verifyDisposableProfile: async () => ({ status: 'NOT_COVERED' }),
    }),
    /disposable profile status/,
  );
});

test('package list identity matching rejects version-prefix collisions', () => {
  assert.equal(packageListHasExactIdentity('@dff652/dsh-ai-asset-hub@0.1.1\n'), true);
  assert.equal(packageListHasExactIdentity('@dff652/dsh-ai-asset-hub 0.1.1\n'), true);
  assert.equal(packageListHasExactIdentity('@dff652/dsh-ai-asset-hub@0.1.10\n'), false);
  assert.equal(packageListHasExactIdentity('@dff652/dsh-ai-asset-hub@0.1.1-malicious\n'), false);
  assert.equal(packageListHasExactIdentity('@dff652/dsh-ai-asset-hub@0.1.1\n@dff652/dsh-ai-asset-hub@0.1.1\n'), false);
});

test('disposable verification uses a test-owned DSH_HOME and explicit workspace-root flags', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-marketplace-test.'));
  const dshBin = path.join(fixture, 'dsh');
  const aiahCommand = path.join(fixture, 'aiah');
  const pnpmCli = path.join(fixture, 'pnpm.mjs');
  await writeFile(dshBin, '#!/bin/sh\nexit 0\n', 'utf8');
  await writeFile(aiahCommand, '#!/bin/sh\nexit 0\n', 'utf8');
  await writeFile(pnpmCli, '#!/bin/sh\nexit 0\n', 'utf8');
  await chmod(dshBin, 0o700);
  await chmod(aiahCommand, 0o700);
  await chmod(pnpmCli, 0o700);
  const calls = [];
  const artifact = Buffer.from('reviewed-test-artifact');
  const expectedSha256 = createHash('sha256').update(artifact).digest('hex');
  let installed = false;
  const runner = async (file, args, options) => {
    calls.push({
      file,
      args,
      dshHome: options.env.DSH_HOME,
      consumerHome: options.env.HOME,
      pnpmStore: options.env.npm_config_store_dir,
    });
    if (args[0] === '--version') {
      return { stdout: file.endsWith('/pnpm') ? `${EXPECTED.pnpmVersion}\n` : `${EXPECTED.dshVersion}\n`, stderr: '' };
    }
    if (args[0] === 'store' && args[1] === 'path') {
      const store = path.join(path.dirname(options.env.DSH_HOME), 'pnpm-store');
      await mkdir(store, { recursive: true });
      return { stdout: `${store}\n`, stderr: '' };
    }
    if (args.includes('add')) {
      installed = true;
      const manifest = path.join(
        options.env.DSH_HOME,
        'profiles',
        EXPECTED.profile,
        'node_modules',
        '@dff652',
        'dsh-ai-asset-hub',
        'package.json',
      );
      await mkdir(path.dirname(manifest), { recursive: true });
      await writeFile(manifest, JSON.stringify({
        name: EXPECTED.packageName,
        version: EXPECTED.packageVersion,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }));
      return { stdout: '', stderr: '' };
    }
    if (args.includes('remove')) {
      installed = false;
      await rm(path.join(
        options.env.DSH_HOME,
        'profiles',
        EXPECTED.profile,
        'node_modules',
        '@dff652',
        'dsh-ai-asset-hub',
      ), { recursive: true, force: true });
      return { stdout: '', stderr: '' };
    }
    if (args.at(-1) === 'list') {
      return { stdout: installed ? `${EXPECTED.packageName} ${EXPECTED.packageVersion}\n` : '', stderr: '' };
    }
    if (args.at(-1) === '--dump-config') {
      return { stdout: installed ? 'serverName: aiah\n' : '', stderr: '' };
    }
    throw new Error(`unexpected fake invocation: ${args.join(' ')}`);
  };

  try {
    const result = await verifyDisposableProfile({
      dshBin,
      aiahCommand,
      pnpmCli,
      artifact,
      expectedSha256,
      runner,
    });
    assert.equal(result.status, 'PASS');
    assert.equal(result.removalClean, true);
    assert.equal(result.isolatedPnpmStore, true);
    assert.equal(result.pnpmVersion, EXPECTED.pnpmVersion);
    const add = calls.find((call) => call.args.includes('add'));
    const remove = calls.find((call) => call.args.includes('remove'));
    assert.deepEqual(add.args.slice(3, 5), ['add', '-w']);
    assert.equal(path.basename(add.args[5]), 'dff652-dsh-ai-asset-hub-0.1.1.tgz');
    assert.notEqual(add.args[5], EXPECTED.tarball);
    assert.deepEqual(remove.args.slice(3), ['remove', '-w', EXPECTED.packageName]);
    assert.ok(calls.every((call) => call.dshHome.startsWith(os.tmpdir())));
    assert.ok(calls.every((call) => !call.dshHome.includes('/profiles/web')));
    assert.ok(calls.every((call) => call.dshHome !== process.env.DSH_HOME));
    assert.ok(calls.every((call) => call.consumerHome !== process.env.HOME));
    assert.ok(calls.every((call) => call.pnpmStore !== undefined));
    assert.ok(calls.every((call) => path.dirname(call.dshHome) === path.dirname(call.pnpmStore)));
    assert.ok(calls.every((call) => path.dirname(call.dshHome) === path.dirname(call.consumerHome)));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('removal proof rejects package residue even after list and config are clean', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-residue-test.'));
  const packageDirectory = path.join(fixture, 'node_modules', '@dff652', 'dsh-ai-asset-hub');
  try {
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(path.join(packageDirectory, 'package.json'), '{}\n', 'utf8');
    await assert.rejects(
      requirePathAbsent(packageDirectory, 'installed package directory'),
      /remains after removal/,
    );
    await rm(packageDirectory, { recursive: true, force: true });
    await requirePathAbsent(packageDirectory, 'installed package directory');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('atomic reports replace old results with mode 0600 and temp conflicts leave no stale PASS', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-report-test.'));
  const report = path.join(fixture, 'report.json');
  try {
    await writeReportAtomic(report, { status: 'PASS' });
    assert.equal((await stat(report)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), { status: 'PASS' });

    await invalidateReport(report);
    await assert.rejects(access(report));
    await writeReportAtomic(report, { status: 'FAIL' });
    assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), { status: 'FAIL' });

    await invalidateReport(report);
    await writeFile(`${report}.${process.pid}.tmp`, 'collision', 'utf8');
    await assert.rejects(writeReportAtomic(report, { status: 'PASS' }), /EEXIST/);
    await assert.rejects(access(report));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('default CLI fails closed and atomically replaces an old PASS report with FAIL', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-cli-report-test.'));
  const report = path.join(fixture, 'report.json');
  try {
    await writeFile(report, '{"status":"PASS"}\n', { encoding: 'utf8', mode: 0o600 });
    await assert.rejects(
      execFileAsync(process.execPath, [verifier, '--report', report]),
      (error) => error.code === 1 && /full verification requires/.test(String(error.stderr)),
    );
    const failure = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(failure.status, 'FAIL');
    assert.match(failure.error, /full verification requires/);
    assert.equal((await stat(report)).mode & 0o777, 0o600);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
