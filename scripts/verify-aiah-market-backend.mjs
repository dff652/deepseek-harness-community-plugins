#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { request as httpRequest } from 'node:http';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  EXPECTED as LISTING_EXPECTED,
  exitCodeForStatus,
  invalidateReport,
  writeReportAtomic,
} from './verify-aiah-marketplace.mjs';

const execFileAsync = promisify(execFile);

export const EXPECTED = Object.freeze({
  dshVersion: '0.1.0-rc.6',
  pnpmVersion: '11.7.0',
  marketName: 'dshmarket',
  marketVersion: '1.10.1',
  marketIntegrity: 'sha512-8AWM8RT2tttJsozTBm6mAfI+cNpCIbeBdP9IoydJdHlH/+x72aNqmv3AWdbNfKDDwkkqM2Ce/XRDhha9HG0Q5Q==',
  aiahSha256: '6836c21f5fe129d2a36ddaa6635b6b9e08bcd442576eabb9de5e93b11ba92ed8',
  profile: 'web',
  packageName: LISTING_EXPECTED.packageName,
  packageVersion: LISTING_EXPECTED.packageVersion,
  sourceTarget: 'github:dff652/deepseek-harness-community-plugins#path:/packages/dsh-ai-asset-hub',
  sourceRepository: 'dff652/deepseek-harness-community-plugins',
  sourceSubpath: 'packages/dsh-ai-asset-hub',
  registryPath: '/dsh-market/registry',
  installPath: '/dsh-market/install',
  uninstallPath: '/dsh-market/uninstall',
  installedPath: '/dsh-market/installed',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function parseArguments(argv) {
  const options = { dshBin: null, pnpmCli: null, aiahCommand: null, report: null };
  const allowed = new Map([
    ['--dsh-bin', 'dshBin'],
    ['--pnpm-cli', 'pnpmCli'],
    ['--aiah-command', 'aiahCommand'],
    ['--report', 'report'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const key = allowed.get(flag);
    if (key === undefined) fail(`unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`);
    if (options[key] !== null) fail(`${flag} may be supplied only once`);
    options[key] = value;
    index += 1;
  }
  for (const [flag, key] of [...allowed].slice(0, 3)) {
    if (options[key] === null) fail(`${flag} is required`);
  }
  return options;
}

function reportPathsFromArguments(argv) {
  return [...new Set(argv.flatMap((value, index) => {
    if (value !== '--report') return [];
    const candidate = argv[index + 1];
    return candidate === undefined || candidate.startsWith('--') ? [] : [candidate];
  }))];
}

async function requireRegularFile(file, label, executable = false) {
  if (!path.isAbsolute(file)) fail(`${label} must be an absolute path`);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  if (executable) await access(file, 1);
  return realpath(file);
}

async function run(file, args, options = {}) {
  try {
    return await execFileAsync(file, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 180_000,
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.stdout ?? error.message).trim().slice(-2000);
    fail(`command failed (${path.basename(file)} ${args.slice(0, 6).join(' ')}): ${detail}`);
  }
}

async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export function validateProviderSha256(actual, label = 'AIAH provider SHA-256') {
  same(actual, EXPECTED.aiahSha256, label);
  return true;
}

export function validateMarketLockfile(lockfile) {
  const text = String(lockfile);
  const header = `  dshmarket@${EXPECTED.marketVersion}:\n`;
  const blocks = [];
  let offset = 0;
  while (offset < text.length) {
    const start = text.indexOf(header, offset);
    if (start === -1) break;
    const end = text.indexOf('\n\n', start);
    blocks.push(text.slice(start, end === -1 ? text.length : end));
    offset = start + header.length;
  }
  const reviewed = blocks.filter((block) => block.includes(`resolution: {integrity: ${EXPECTED.marketIntegrity}}`));
  if (reviewed.length !== 1) fail('dshmarket lockfile stanza does not contain the reviewed integrity');
  return true;
}

export function parseLockedSourceEvidence(lockfile) {
  const text = String(lockfile);
  const repo = EXPECTED.sourceRepository.replace('/', '\\/');
  const subpath = EXPECTED.sourceSubpath.replaceAll('/', '\\/');
  const importer = new RegExp(
    `'${EXPECTED.packageName.replace('/', '\\/')}':\\n` +
    `        specifier: ${EXPECTED.sourceTarget.replaceAll('/', '\\/')}\\n` +
    `        version: https:\\/\\/codeload\\.github\\.com\\/${repo}\\/tar\\.gz\\/([0-9a-f]{40})#path:\\/${subpath}`,
  ).exec(text);
  if (importer === null) fail('AIAH importer is not bound to the reviewed GitHub source target');
  const packageHeader = `  '${EXPECTED.packageName}@https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${importer[1]}#path:/${EXPECTED.sourceSubpath}':\n`;
  const start = text.indexOf(packageHeader);
  if (start === -1) {
    const publicShape = text.split('\n').filter((line) => line.includes(EXPECTED.packageName) || line.includes(EXPECTED.sourceRepository)).slice(0, 8).join(' | ');
    fail(`AIAH source commit is not bound to the package lockfile stanza; public lock shape: ${publicShape}`);
  }
  const end = text.indexOf('\n\n', start);
  const block = text.slice(start, end === -1 ? text.length : end);
  const resolution = block.split('\n').find((line) => line.trimStart().startsWith('resolution: {')) ?? '';
  const expectedTarball = `tarball: https://codeload.github.com/${EXPECTED.sourceRepository}/tar.gz/${importer[1]}`;
  const integrity = /(?:^|, )integrity: (sha512-[A-Za-z0-9+/=]+)(?:,|})/.exec(resolution)?.[1] ?? null;
  if (
    !resolution.includes('gitHosted: true')
    || !resolution.includes(`path: /${EXPECTED.sourceSubpath}`)
    || !resolution.includes(expectedTarball)
    || integrity === null
    || !block.includes(`version: ${EXPECTED.packageVersion}`)
  ) {
    fail(`AIAH source commit is not bound to the package lockfile stanza; public package block: ${block.slice(0, 1000).replaceAll('\n', ' | ')}`);
  }
  return { commit: importer[1], integrity };
}

export function parseLockedSourceCommit(lockfile) {
  return parseLockedSourceEvidence(lockfile).commit;
}

export function validateRegistryResponse(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) fail('registry response must be an object');
  const registry = payload.registry;
  if (registry === null || typeof registry !== 'object' || !Array.isArray(registry.plugins)) fail('registry.plugins must be an array');
  const matches = registry.plugins.filter((entry) => entry?.url === LISTING_EXPECTED.url || entry?.name === LISTING_EXPECTED.name);
  if (matches.length !== 1) fail(`expected exactly one AIAH registry entry, got ${matches.length}`);
  const entry = matches[0];
  same(entry.name, LISTING_EXPECTED.name, 'registry entry.name');
  same(entry.owner, LISTING_EXPECTED.owner, 'registry entry.owner');
  same(entry.url, LISTING_EXPECTED.url, 'registry entry.url');
  same(entry.npm, null, 'registry entry.npm');
  same(entry.tarball, LISTING_EXPECTED.tarball, 'registry entry.tarball');
  return { source: payload.source ?? null, entry };
}

export async function waitForExpectedRegistry({
  port,
  requestFn = requestJson,
  timeoutMs = 45_000,
}) {
  return waitFor(async () => {
    const result = validateRegistryResponse(await requestFn({ port, route: EXPECTED.registryPath }));
    return ['live', 'cache'].includes(result.source) ? result : null;
  }, timeoutMs, 'live AIAH market registry entry');
}

export function parseResolvedSourceCommit(output) {
  const escaped = EXPECTED.sourceRepository.replace('/', '\\/');
  const pattern = new RegExp(`codeload\\.github\\.com\\/${escaped}\\/tar\\.gz\\/([0-9a-f]{40})#path:\\/${EXPECTED.sourceSubpath.replaceAll('/', '\\/')}`, 'g');
  const commits = new Set();
  for (const match of String(output).matchAll(pattern)) commits.add(match[1]);
  if (commits.size !== 1) fail(`expected exactly one resolved source commit, got ${commits.size}`);
  return [...commits][0];
}

export function validateInstallResponse(payload) {
  if (payload?.ok !== true) fail('market install response is not ok');
  same(payload.installed?.[EXPECTED.packageName], EXPECTED.sourceTarget, 'market installed source target');
  same(payload.activation?.[EXPECTED.packageName]?.state, 'restart', 'market activation state');
  same(payload.activation?.[EXPECTED.packageName]?.bundle, true, 'market activation bundle flag');
  same(payload.activation?.[EXPECTED.packageName]?.hot, false, 'market activation hot flag');
  const sourceCommit = parseResolvedSourceCommit(payload.stdout);
  return { sourceCommit, activation: payload.activation?.[EXPECTED.packageName] ?? null };
}

export function validateUninstallResponse(payload) {
  if (payload?.ok !== true) fail('market uninstall response is not ok');
  if (payload.installed?.[EXPECTED.packageName] !== undefined) fail('market uninstall response still lists AIAH');
  return true;
}

export function validateInstalledResponse(payload, expectedPresent) {
  if (payload === null || typeof payload !== 'object') fail('market installed response must be an object');
  const spec = payload.installed?.[EXPECTED.packageName];
  const present = Array.isArray(payload.present) && payload.present.includes(EXPECTED.packageName);
  if (expectedPresent) {
    same(spec, EXPECTED.sourceTarget, 'installed source target');
    same(present, true, 'installed package presence');
  } else {
    same(spec, undefined, 'removed source target');
    same(present, false, 'removed package presence');
  }
}

export async function requestJson({ port, method = 'GET', route, body = null, requestImpl = httpRequest }) {
  const authority = `127.0.0.1:${port}`;
  const encoded = body === null ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = requestImpl({
      hostname: '127.0.0.1',
      port,
      path: route,
      method,
      headers: {
        host: authority,
        origin: `http://${authority}`,
        accept: 'application/json',
        ...(encoded === null ? {} : {
          'content-type': 'application/json',
          'content-length': String(encoded.length),
        }),
      },
      signal: AbortSignal.timeout(180_000),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          reject(new Error(`${method} ${route} returned non-JSON HTTP ${response.statusCode}`));
          return;
        }
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          reject(new Error(`${method} ${route} returned HTTP ${response.statusCode}: ${String(payload.error ?? 'unknown error').slice(0, 500)}`));
          return;
        }
        resolve(payload);
      });
    });
    request.on('error', reject);
    if (encoded !== null) request.write(encoded);
    request.end();
  });
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`${label} timed out${lastError === null ? '' : `: ${lastError.message}`}`);
}

async function matchingProviderPids(providerPath) {
  const entries = await readdir('/proc', { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      const cmdline = await readFile(`/proc/${entry.name}/cmdline`);
      const args = cmdline.toString('utf8').split('\0').filter(Boolean);
      if (args[0] === providerPath && args[1] === 'mcp') matches.push(Number(entry.name));
    } catch (error) {
      if (!['ENOENT', 'EACCES'].includes(error.code)) throw error;
    }
  }
  return matches;
}

export async function startWeb(dshBin, env, cwd, readinessTimeoutMs = 30_000) {
  const child = spawn(dshBin, ['--profile', EXPECTED.profile, '--host', '127.0.0.1', '--port', '0'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError = null;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
  child.once('error', (error) => { spawnError = error; });
  try {
    const port = await waitFor(async () => {
      if (spawnError !== null) fail(`dsh web spawn failed: ${spawnError.message}`);
      const match = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match !== null) return Number(match[1]);
      if (child.exitCode !== null) fail(`dsh web exited before readiness: ${output.slice(-1500)}`);
      return null;
    }, readinessTimeoutMs, 'dsh web readiness');
    return { child, port, output: () => output };
  } catch (error) {
    try {
      await stopWeb({ child });
    } catch {
      // startWeb still rejects; exact provider cleanup remains with the caller.
    }
    throw error;
  }
}

async function stopWeb(server) {
  if (server.child.exitCode !== null) return;
  const exited = new Promise((resolve) => server.child.once('exit', () => resolve(true)));
  server.child.kill('SIGINT');
  let gracefulTimer;
  const graceful = await Promise.race([
    exited,
    new Promise((resolve) => { gracefulTimer = setTimeout(() => resolve(false), 10_000); }),
  ]);
  clearTimeout(gracefulTimer);
  if (!graceful) {
    server.child.kill('SIGKILL');
    let forcedTimer;
    await Promise.race([
      exited,
      new Promise((resolve) => { forcedTimer = setTimeout(resolve, 5_000); }),
    ]);
    clearTimeout(forcedTimer);
    fail('dsh web did not stop within the cleanup bound');
  }
}

function ensureManifestRemoved(manifest) {
  if (manifest.dependencies?.[EXPECTED.packageName] !== undefined) fail('profile dependency remains after market uninstall');
  if (manifest.dsh?.profile?.bundles?.includes(EXPECTED.packageName)) fail('profile bundle remains after market uninstall');
}

export function buildPassReport({
  sourceCommit,
  dshVersion,
  pnpmVersion,
  marketIntegrityVerified,
  exactProviderArtifact,
  restartProviderStarted,
  sourceIntegrity,
}) {
  same(marketIntegrityVerified, true, 'market integrity verification');
  same(exactProviderArtifact, true, 'provider artifact verification');
  same(restartProviderStarted, true, 'provider restart activation');
  if (!/^sha512-[A-Za-z0-9+/=]+$/.test(sourceIntegrity)) fail('source integrity is missing or invalid');
  return {
    schemaVersion: 1,
    status: 'PASS',
    scope: 'dshmarket-backend-disposable-install-restart-uninstall',
    generatedAt: new Date().toISOString(),
    runtime: {
      dshVersion,
      pnpmVersion,
      dshmarketVersion: EXPECTED.marketVersion,
      dshmarketIntegrity: EXPECTED.marketIntegrity,
      dshmarketIntegrityVerified: marketIntegrityVerified,
      aiahProviderSha256: EXPECTED.aiahSha256,
      exactProviderArtifact,
    },
    marketplace: {
      entryName: LISTING_EXPECTED.name,
      sourceTarget: EXPECTED.sourceTarget,
      sourceCommit,
      sourceIntegrity,
      sourceInstall: true,
      exactReleaseArtifact: false,
      browserDomClick: false,
      l5ModelUse: false,
      sameOriginBackendPost: true,
      restartActivation: restartProviderStarted,
      uninstallCleanup: true,
    },
    isolation: {
      disposableDshHome: true,
      disposableConsumerHome: true,
      disposablePnpmStore: true,
      testOwnedProviderCopy: true,
      liveProfileChanged: false,
    },
  };
}

export async function verifyMarketBackend({ dshBin, pnpmCli, aiahCommand }) {
  const resolvedDsh = await requireRegularFile(dshBin, '--dsh-bin', true);
  const resolvedPnpm = await requireRegularFile(pnpmCli, '--pnpm-cli');
  const resolvedAiah = await requireRegularFile(aiahCommand, '--aiah-command', true);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-market-backend.'));
  const dshHome = path.join(temporaryRoot, 'dsh-home');
  const consumerHome = path.join(temporaryRoot, 'consumer-home');
  const executableDirectory = path.join(temporaryRoot, 'bin');
  const providerCopy = path.join(executableDirectory, 'aiah');
  const pnpmWrapper = path.join(executableDirectory, 'pnpm');
  let server = null;
  try {
    await mkdir(executableDirectory, { recursive: true });
    validateProviderSha256(await sha256File(resolvedAiah));
    await copyFile(resolvedAiah, providerCopy);
    await chmod(providerCopy, 0o700);
    validateProviderSha256(await sha256File(providerCopy), 'test-owned AIAH provider SHA-256');
    await writeFile(
      pnpmWrapper,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(resolvedPnpm)} "$@"\n`,
      { encoding: 'utf8', mode: 0o700, flag: 'wx' },
    );
    const env = {
      ...process.env,
      PATH: `${executableDirectory}${path.delimiter}${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: consumerHome,
      XDG_CACHE_HOME: path.join(temporaryRoot, 'xdg-cache'),
      XDG_CONFIG_HOME: path.join(temporaryRoot, 'xdg-config'),
      XDG_DATA_HOME: path.join(temporaryRoot, 'xdg-data'),
      npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
      npm_config_registry: 'https://registry.npmjs.org',
      npm_config_store_dir: path.join(temporaryRoot, 'pnpm-store'),
      DSH_HOME: dshHome,
      DSH_AIAH_COMMAND: providerCopy,
    };
    const options = { cwd: temporaryRoot, env };
    const pnpmVersion = String((await run(process.execPath, [resolvedPnpm, '--version'], options)).stdout).trim();
    same(pnpmVersion, EXPECTED.pnpmVersion, 'pnpm version');
    const dshVersion = String((await run(resolvedDsh, ['--version'], options)).stdout).trim();
    same(dshVersion, EXPECTED.dshVersion, 'DSH version');
    await run(resolvedDsh, [
      'plugin', '--profile', EXPECTED.profile, 'add', '-w', `${EXPECTED.marketName}@${EXPECTED.marketVersion}`,
    ], options);
    const profileDirectory = path.join(dshHome, 'profiles', EXPECTED.profile);
    const marketManifest = JSON.parse(await readFile(path.join(profileDirectory, 'node_modules', EXPECTED.marketName, 'package.json'), 'utf8'));
    same(marketManifest.name, EXPECTED.marketName, 'installed dshmarket name');
    same(marketManifest.version, EXPECTED.marketVersion, 'installed dshmarket version');
    const lock = await readFile(path.join(profileDirectory, 'pnpm-lock.yaml'), 'utf8');
    validateMarketLockfile(lock);
    const store = String((await run(process.execPath, [resolvedPnpm, 'store', 'path'], { ...options, cwd: profileDirectory })).stdout).trim();
    const resolvedStore = await realpath(store);
    const storeRelative = path.relative(temporaryRoot, resolvedStore);
    if (storeRelative === '' || storeRelative === '..' || storeRelative.startsWith(`..${path.sep}`) || path.isAbsolute(storeRelative)) {
      fail('pnpm store escaped the disposable root');
    }

    server = await startWeb(resolvedDsh, env, temporaryRoot);
    await waitForExpectedRegistry({ port: server.port });
    const install = validateInstallResponse(await requestJson({
      port: server.port,
      method: 'POST',
      route: EXPECTED.installPath,
      body: { url: LISTING_EXPECTED.url },
    }));
    const sourceLock = await readFile(path.join(profileDirectory, 'pnpm-lock.yaml'), 'utf8');
    const lockedSource = parseLockedSourceEvidence(sourceLock);
    same(install.sourceCommit, lockedSource.commit, 'market response and lockfile source commit');
    const packageDirectory = path.join(profileDirectory, 'node_modules', '@dff652', 'dsh-ai-asset-hub');
    const packageManifest = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
    same(packageManifest.name, EXPECTED.packageName, 'market-installed package name');
    same(packageManifest.version, EXPECTED.packageVersion, 'market-installed package version');
    const profileAfterInstall = JSON.parse(await readFile(path.join(profileDirectory, 'package.json'), 'utf8'));
    same(profileAfterInstall.dependencies?.[EXPECTED.packageName], EXPECTED.sourceTarget, 'profile source dependency');
    same(profileAfterInstall.dsh?.profile?.bundles?.filter((name) => name === EXPECTED.packageName).length, 1, 'profile bundle count');
    await stopWeb(server);
    server = null;

    server = await startWeb(resolvedDsh, env, temporaryRoot);
    await waitFor(async () => (await matchingProviderPids(providerCopy)).length === 1, 30_000, 'AIAH provider startup after restart');
    const restartProviderStarted = true;
    validateInstalledResponse(await requestJson({ port: server.port, route: EXPECTED.installedPath }), true);
    validateUninstallResponse(await requestJson({
      port: server.port,
      method: 'POST',
      route: EXPECTED.uninstallPath,
      body: { name: EXPECTED.packageName },
    }));
    validateInstalledResponse(await requestJson({ port: server.port, route: EXPECTED.installedPath }), false);
    const profileAfterRemove = JSON.parse(await readFile(path.join(profileDirectory, 'package.json'), 'utf8'));
    ensureManifestRemoved(profileAfterRemove);
    try {
      await lstat(packageDirectory);
      fail('market uninstall left the package directory behind');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await stopWeb(server);
    server = null;
    await waitFor(async () => (await matchingProviderPids(providerCopy)).length === 0, 10_000, 'AIAH provider cleanup after stop');

    server = await startWeb(resolvedDsh, env, temporaryRoot);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    same((await matchingProviderPids(providerCopy)).length, 0, 'provider child after removal restart');
    validateInstalledResponse(await requestJson({ port: server.port, route: EXPECTED.installedPath }), false);
    await stopWeb(server);
    server = null;

    return buildPassReport({
      sourceCommit: install.sourceCommit,
      sourceIntegrity: lockedSource.integrity,
      dshVersion,
      pnpmVersion,
      marketIntegrityVerified: true,
      exactProviderArtifact: true,
      restartProviderStarted,
    });
  } finally {
    if (server !== null) {
      try {
        await stopWeb(server);
      } catch {
        // Preserve the primary failure and continue with exact test-owned cleanup.
      }
    }
    for (const pid of await matchingProviderPids(providerCopy)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await waitFor(async () => (await matchingProviderPids(providerCopy)).length === 0, 5_000, 'final test-owned provider cleanup');
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function execute(argv) {
  const options = parseArguments(argv);
  return verifyMarketBackend(options);
}

export async function main(argv = process.argv.slice(2)) {
  const reportPaths = reportPathsFromArguments(argv);
  for (const reportPath of reportPaths) await invalidateReport(reportPath);
  const reportPath = reportPaths.length === 1 ? reportPaths[0] : null;
  let report;
  try {
    report = await execute(argv);
  } catch (error) {
    if (reportPath !== null) {
      try {
        await writeReportAtomic(reportPath, {
          schemaVersion: 1,
          status: 'FAIL',
          generatedAt: new Date().toISOString(),
          error: 'dshmarket backend verification failed; see stderr for the local diagnostic',
        });
      } catch (reportError) {
        error.message = `${error.message}; FAIL report write also failed: ${reportError.message}`;
      }
    }
    throw error;
  }
  if (reportPath !== null) await writeReportAtomic(reportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCodeForStatus(report.status);
  return report;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
