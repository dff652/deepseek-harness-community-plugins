import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  EXPECTED,
  buildPassReport,
  parseArguments,
  parseLockedSourceCommit,
  parseResolvedSourceCommit,
  requestJson,
  startWeb,
  validateInstallResponse,
  validateInstalledResponse,
  validateMarketLockfile,
  validateProviderSha256,
  validateRegistryResponse,
  validateUninstallResponse,
  waitForExpectedRegistry,
} from '../scripts/verify-aiah-market-backend.mjs';
import { EXPECTED as LISTING_EXPECTED } from '../scripts/verify-aiah-marketplace.mjs';

const execFileAsync = promisify(execFile);
const verifier = fileURLToPath(new URL('../scripts/verify-aiah-market-backend.mjs', import.meta.url));
const SOURCE_INTEGRITY = 'sha512-Mk/5tjXnx/KsCXhsy1YmCooE/eHZtx+WmPirfBJaxk1pDsAHxeMA0Ddu1tPX1/US6/nbvcBMSh1A0HDR1VJb2g==';

function registryEntry(overrides = {}) {
  return {
    name: LISTING_EXPECTED.name,
    owner: LISTING_EXPECTED.owner,
    url: LISTING_EXPECTED.url,
    npm: null,
    tarball: LISTING_EXPECTED.tarball,
    ...overrides,
  };
}

function installOutput(commit = 'f16f317190b4a98db5177045f0b4755ee93ae2fd') {
  return JSON.stringify({
    packageId: `https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${commit}#path:/${EXPECTED.sourceSubpath}`,
  });
}

function lockfile(commit = 'f16f317190b4a98db5177045f0b4755ee93ae2fd') {
  return `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '${EXPECTED.packageName}':
        specifier: ${EXPECTED.sourceTarget}
        version: https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${commit}#path:/${EXPECTED.sourceSubpath}
      dshmarket:
        specifier: ${EXPECTED.marketVersion}
        version: ${EXPECTED.marketVersion}

packages:

  '${EXPECTED.packageName}@https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${commit}#path:/${EXPECTED.sourceSubpath}':
    resolution: {gitHosted: true, integrity: ${SOURCE_INTEGRITY}, path: /${EXPECTED.sourceSubpath}, tarball: https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${commit}}
    version: ${EXPECTED.packageVersion}

  dshmarket@${EXPECTED.marketVersion}:
    resolution: {integrity: ${EXPECTED.marketIntegrity}}
`;
}

test('CLI requires all runtime boundaries and rejects duplicates or unknown flags', () => {
  assert.throws(() => parseArguments([]), /--dsh-bin is required/);
  assert.throws(() => parseArguments(['--dsh-bin', '/bin/dsh']), /--pnpm-cli is required/);
  assert.throws(
    () => parseArguments([
      '--dsh-bin', '/bin/dsh',
      '--pnpm-cli', '/bin/pnpm',
      '--aiah-command', '/bin/aiah',
      '--dsh-bin', '/other/dsh',
    ]),
    /only once/,
  );
  assert.throws(() => parseArguments(['--listing-only']), /unknown argument/);
  assert.deepEqual(parseArguments([
    '--dsh-bin', '/bin/dsh',
    '--pnpm-cli', '/bin/pnpm',
    '--aiah-command', '/bin/aiah',
    '--report', '/tmp/report.json',
  ]), {
    dshBin: '/bin/dsh',
    pnpmCli: '/bin/pnpm',
    aiahCommand: '/bin/aiah',
    report: '/tmp/report.json',
  });
});

test('registry validation accepts one exact live entry and rejects drift or duplicates', () => {
  const payload = { source: 'live', registry: { plugins: [registryEntry()] } };
  assert.equal(validateRegistryResponse(payload).source, 'live');
  assert.throws(
    () => validateRegistryResponse({ source: 'live', registry: { plugins: [registryEntry(), registryEntry()] } }),
    /exactly one/,
  );
  assert.throws(
    () => validateRegistryResponse({ source: 'live', registry: { plugins: [registryEntry({ npm: EXPECTED.packageName })] } }),
    /entry.npm/,
  );
  assert.throws(
    () => validateRegistryResponse({ source: 'live', registry: { plugins: [registryEntry({ tarball: 'https://example.invalid/a.tgz' })] } }),
    /entry.tarball/,
  );
});

test('registry discovery retries a transient bundled snapshot until the live entry arrives', async () => {
  const responses = [
    { source: 'snapshot', registry: { plugins: [] } },
    { source: 'live', registry: { plugins: [registryEntry()] } },
  ];
  let calls = 0;
  const result = await waitForExpectedRegistry({
    port: 1,
    timeoutMs: 2_000,
    requestFn: async () => responses[Math.min(calls++, responses.length - 1)],
  });
  assert.equal(result.source, 'live');
  assert.equal(calls, 2);
});

test('resolved source commit parser requires one exact repo and subpath identity', () => {
  const commit = 'f16f317190b4a98db5177045f0b4755ee93ae2fd';
  assert.equal(parseResolvedSourceCommit(`${installOutput(commit)}\n${installOutput(commit)}`), commit);
  assert.throws(() => parseResolvedSourceCommit('no source resolution'), /exactly one/);
  assert.throws(
    () => parseResolvedSourceCommit(`${installOutput(commit)}\n${installOutput('0123456789abcdef0123456789abcdef01234567')}`),
    /exactly one/,
  );
  assert.throws(
    () => parseResolvedSourceCommit(installOutput(commit).replace(EXPECTED.sourceSubpath, 'packages/other')),
    /exactly one/,
  );
});

test('lockfile validators bind integrity and source commit to the exact package stanzas', () => {
  const commit = 'f16f317190b4a98db5177045f0b4755ee93ae2fd';
  assert.equal(validateMarketLockfile(lockfile(commit)), true);
  assert.equal(parseLockedSourceCommit(lockfile(commit)), commit);
  const crossStanzaIntegrity = lockfile(commit)
    .replace(EXPECTED.marketIntegrity, 'sha512-wrong')
    .concat(`\n  unrelated@1.0.0:\n    resolution: {integrity: ${EXPECTED.marketIntegrity}}\n`);
  assert.throws(() => validateMarketLockfile(crossStanzaIntegrity), /reviewed integrity/);
  const otherCommit = '0123456789abcdef0123456789abcdef01234567';
  const mismatchedPackageStanza = lockfile(commit).replaceAll(
    `${EXPECTED.packageName}@https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${commit}`,
    `${EXPECTED.packageName}@https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${otherCommit}`,
  );
  assert.throws(() => parseLockedSourceCommit(mismatchedPackageStanza), /package lockfile stanza/);
});

test('provider identity validator rejects any non-reviewed SHA-256', () => {
  assert.equal(validateProviderSha256(EXPECTED.aiahSha256), true);
  assert.throws(() => validateProviderSha256('0'.repeat(64)), /AIAH provider SHA-256/);
});

test('install, inventory and uninstall response validators are fail closed', () => {
  const commit = 'f16f317190b4a98db5177045f0b4755ee93ae2fd';
  const install = {
    ok: true,
    stdout: installOutput(commit),
    installed: { [EXPECTED.packageName]: EXPECTED.sourceTarget },
    activation: { [EXPECTED.packageName]: { state: 'restart', bundle: true, hot: false } },
  };
  assert.equal(validateInstallResponse(install).sourceCommit, commit);
  assert.throws(() => validateInstallResponse({ ...install, ok: false }), /not ok/);
  assert.throws(
    () => validateInstallResponse({ ...install, installed: { [EXPECTED.packageName]: LISTING_EXPECTED.tarball } }),
    /source target/,
  );
  for (const activation of [
    undefined,
    { state: 'live', bundle: true, hot: false },
    { state: 'restart', bundle: false, hot: false },
    { state: 'restart', bundle: true, hot: true },
  ]) {
    assert.throws(
      () => validateInstallResponse({ ...install, activation: { [EXPECTED.packageName]: activation } }),
      /activation/,
    );
  }
  validateInstalledResponse({
    installed: { [EXPECTED.packageName]: EXPECTED.sourceTarget },
    present: [EXPECTED.packageName],
  }, true);
  validateInstalledResponse({ installed: {}, present: [] }, false);
  assert.throws(() => validateInstalledResponse({ installed: {}, present: [] }, true), /source target/);
  assert.equal(validateUninstallResponse({ ok: true, installed: { dshmarket: '1.10.1' } }), true);
  assert.throws(
    () => validateUninstallResponse({ ok: true, installed: { [EXPECTED.packageName]: EXPECTED.sourceTarget } }),
    /still lists/,
  );
});

test('same-origin HTTP helper sends the UI route payload and rejects non-2xx', async () => {
  const seen = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      seen.push({
        method: request.method,
        url: request.url,
        host: request.headers.host,
        origin: request.headers.origin,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      if (request.url === '/fail') {
        response.writeHead(403, { 'content-type': 'application/json' });
        response.end('{"error":"untrusted origin"}');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve())));
  const port = server.address().port;
  try {
    assert.deepEqual(await requestJson({
      port,
      method: 'POST',
      route: EXPECTED.installPath,
      body: { url: LISTING_EXPECTED.url },
    }), { ok: true });
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].url, EXPECTED.installPath);
    assert.equal(seen[0].host, `127.0.0.1:${port}`);
    assert.equal(seen[0].origin, `http://127.0.0.1:${port}`);
    assert.deepEqual(JSON.parse(seen[0].body), { url: LISTING_EXPECTED.url });
    await assert.rejects(requestJson({ port, route: '/fail' }), /HTTP 403: untrusted origin/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('web readiness failure terminates the spawned test process', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-market-start-failure.'));
  const fakeDsh = path.join(fixture, 'fake-dsh');
  const pidFile = path.join(fixture, 'pid');
  try {
    await writeFile(
      fakeDsh,
      '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.TEST_PID_FILE, String(process.pid)); setInterval(() => {}, 1000);\n',
      { encoding: 'utf8', mode: 0o700 },
    );
    await chmod(fakeDsh, 0o700);
    await assert.rejects(
      startWeb(fakeDsh, { ...process.env, TEST_PID_FILE: pidFile }, fixture, 200),
      /readiness.*timed out/,
    );
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), (error) => error.code === 'ESRCH');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('web spawn errors reject without manufacturing a server handle', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-market-spawn-failure.'));
  try {
    await assert.rejects(
      startWeb(path.join(fixture, 'missing-dsh'), process.env, fixture, 200),
      /spawn failed/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('PASS report separates source backend evidence from Release, browser and L5 evidence', () => {
  const report = buildPassReport({
    sourceCommit: 'f16f317190b4a98db5177045f0b4755ee93ae2fd',
    dshVersion: EXPECTED.dshVersion,
    pnpmVersion: EXPECTED.pnpmVersion,
    marketIntegrityVerified: true,
    exactProviderArtifact: true,
    restartProviderStarted: true,
    sourceIntegrity: SOURCE_INTEGRITY,
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.marketplace.sourceInstall, true);
  assert.equal(report.marketplace.sourceIntegrity, SOURCE_INTEGRITY);
  assert.equal(report.marketplace.exactReleaseArtifact, false);
  assert.equal(report.marketplace.browserDomClick, false);
  assert.equal(report.marketplace.l5ModelUse, false);
  assert.equal(report.marketplace.sameOriginBackendPost, true);
  assert.equal(report.isolation.liveProfileChanged, false);
  assert.equal(report.runtime.aiahProviderSha256, EXPECTED.aiahSha256);
  assert.equal(report.runtime.exactProviderArtifact, true);
  assert.throws(() => buildPassReport({
    sourceCommit: 'f16f317190b4a98db5177045f0b4755ee93ae2fd',
    dshVersion: EXPECTED.dshVersion,
    pnpmVersion: EXPECTED.pnpmVersion,
    marketIntegrityVerified: true,
    exactProviderArtifact: false,
    restartProviderStarted: true,
    sourceIntegrity: SOURCE_INTEGRITY,
  }), /provider artifact/);
});

test('CLI failure invalidates an old PASS and writes a private FAIL report', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-market-backend-cli.'));
  const report = path.join(fixture, 'report.json');
  try {
    await writeFile(report, '{"status":"PASS"}\n', { encoding: 'utf8', mode: 0o600 });
    await assert.rejects(
      execFileAsync(process.execPath, [verifier, '--report', report]),
      (error) => error.code === 1 && /--dsh-bin is required/.test(String(error.stderr)),
    );
    const failure = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(failure.status, 'FAIL');
    assert.equal(failure.error, 'dshmarket backend verification failed; see stderr for the local diagnostic');
    assert.equal((await stat(report)).mode & 0o777, 0o600);
    await access(report);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('duplicate report flags cannot preserve a stale PASS', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-market-backend-duplicate-report.'));
  const report = path.join(fixture, 'report.json');
  try {
    await writeFile(report, '{"status":"PASS","stale":true}\n', { encoding: 'utf8', mode: 0o600 });
    await assert.rejects(
      execFileAsync(process.execPath, [verifier, '--report', report, '--report', report]),
      (error) => error.code === 1 && /--report may be supplied only once/.test(String(error.stderr)),
    );
    const failure = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(failure.status, 'FAIL');
    assert.equal(failure.stale, undefined);
    assert.equal((await stat(report)).mode & 0o777, 0o600);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
