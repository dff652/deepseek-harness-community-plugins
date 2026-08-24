#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EXPECTED = Object.freeze({
  catalogUrl: 'https://awesome-dsh-plugin.com/plugins.json',
  name: 'deepseek-harness-community-plugins#dsh-ai-asset-hub',
  owner: 'dff652',
  url: 'https://github.com/dff652/deepseek-harness-community-plugins/tree/main/packages/dsh-ai-asset-hub',
  page: 'https://awesome-dsh-plugin.com/p/dff652/deepseek-harness-community-plugins--packages-dsh-ai-asset-hub/',
  category: 'tools',
  description: Object.freeze({
    en: 'Connects DeepSeek Harness to a deployment-owned AI Asset Hub MCP server and exposes eight reviewed read-only asset tools.',
    zh: '将 DeepSeek Harness 连接到部署方管理的 AI Asset Hub MCP 服务，并提供八个经过审查的只读资产工具。',
  }),
  tarball: 'https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-ai-asset-hub-v0.1.1/dff652-dsh-ai-asset-hub-0.1.1.tgz',
  sha256: '8a6409cbe69b97269dc7a959e6ddc8ea9814bd86c132939488f9a1b840de7314',
  packageName: '@dff652/dsh-ai-asset-hub',
  packageVersion: '0.1.1',
  dshVersion: '0.1.0-rc.6',
  pnpmVersion: '11.7.0',
  profile: 'market-aiah',
  install: 'dsh plugin --profile web add "https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-ai-asset-hub-v0.1.1/dff652-dsh-ai-asset-hub-0.1.1.tgz"',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function validateCatalog(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) fail('catalog root must be an object');
  if (!Array.isArray(payload.plugins)) fail('catalog.plugins must be an array');
  same(payload.count, payload.plugins.length, 'catalog.count');

  const matches = payload.plugins.filter((entry) => entry?.url === EXPECTED.url || entry?.name === EXPECTED.name);
  if (matches.length !== 1) fail(`expected exactly one AIAH marketplace entry, got ${matches.length}`);
  const entry = matches[0];
  same(entry.name, EXPECTED.name, 'entry.name');
  same(entry.owner, EXPECTED.owner, 'entry.owner');
  same(entry.url, EXPECTED.url, 'entry.url');
  same(entry.page, EXPECTED.page, 'entry.page');
  same(entry.category, EXPECTED.category, 'entry.category');
  same(entry.description?.en, EXPECTED.description.en, 'entry.description.en');
  same(entry.description?.zh, EXPECTED.description.zh, 'entry.description.zh');
  same(entry.npm, null, 'entry.npm');
  same(entry.tarball, EXPECTED.tarball, 'entry.tarball');
  if (typeof entry.added !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.added)) fail('entry.added must be an ISO date');
  same(entry.install, EXPECTED.install, 'entry.install');

  return {
    catalogUpdated: payload.updated ?? null,
    catalogCount: payload.count,
    entry,
  };
}

async function fetchBytes(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail(`GET ${url} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function verifyListing(fetchImpl = fetch, catalogUrl = EXPECTED.catalogUrl) {
  const catalogBytes = await fetchBytes(catalogUrl, fetchImpl);
  let payload;
  try {
    payload = JSON.parse(catalogBytes.toString('utf8'));
  } catch {
    fail('catalog response is not valid JSON');
  }
  const catalog = validateCatalog(payload);
  const artifact = await fetchBytes(catalog.entry.tarball, fetchImpl);
  const digest = createHash('sha256').update(artifact).digest('hex');
  same(digest, EXPECTED.sha256, 'release tarball SHA-256');
  return {
    artifact,
    listing: {
      catalogUrl,
      updated: catalog.catalogUpdated,
      count: catalog.catalogCount,
      entry: {
        name: catalog.entry.name,
        owner: catalog.entry.owner,
        url: catalog.entry.url,
        page: catalog.entry.page,
        category: catalog.entry.category,
        description: catalog.entry.description,
        tarball: catalog.entry.tarball,
        added: catalog.entry.added,
      },
      artifact: {
        sha256: digest,
        bytes: artifact.length,
      },
    },
  };
}

async function requireExecutable(file, label) {
  if (!path.isAbsolute(file)) fail(`${label} must be an absolute path`);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  await access(file, 1);
  return realpath(file);
}

async function defaultRunner(file, args, options) {
  try {
    return await execFileAsync(file, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 180_000,
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.stdout ?? error.message).trim().slice(0, 2000);
    fail(`DSH command failed (${args.slice(0, 5).join(' ')}): ${detail}`);
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function packageListHasExactIdentity(output) {
  const pattern = /@dff652\/dsh-ai-asset-hub(?:@|\s+)0\.1\.1(?:\s|$)/;
  return String(output).split('\n').filter((line) => pattern.test(line)).length === 1;
}

export async function requirePathAbsent(target, label) {
  try {
    await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  fail(`${label} remains after removal`);
}

export async function verifyDisposableProfile({
  dshBin,
  aiahCommand,
  pnpmCli,
  artifact,
  runner = defaultRunner,
  expectedSha256 = EXPECTED.sha256,
}) {
  const resolvedDsh = await requireExecutable(dshBin, '--dsh-bin');
  const resolvedAiah = await requireExecutable(aiahCommand, '--aiah-command');
  const resolvedPnpm = await requireExecutable(pnpmCli, '--pnpm-cli');
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-marketplace.'));
  const dshHome = path.join(temporaryRoot, 'home');
  const consumerHome = path.join(temporaryRoot, 'consumer-home');
  const pnpmStore = path.join(temporaryRoot, 'pnpm-store');
  const executableDirectory = path.join(temporaryRoot, 'bin');
  const pnpmWrapper = path.join(executableDirectory, 'pnpm');
  const localTarball = path.join(temporaryRoot, 'dff652-dsh-ai-asset-hub-0.1.1.tgz');
  let removed = false;
  let dshVersion = null;
  let pnpmVersion = null;
  let options = null;
  try {
    await mkdir(executableDirectory);
    await writeFile(
      pnpmWrapper,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(resolvedPnpm)} "$@"\n`,
      { encoding: 'utf8', mode: 0o700 },
    );
    const localDigest = createHash('sha256').update(artifact).digest('hex');
    same(localDigest, expectedSha256, 'local release tarball SHA-256');
    await writeFile(localTarball, artifact, { mode: 0o600, flag: 'wx' });
    const environment = {
      ...process.env,
      PATH: `${executableDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: consumerHome,
      XDG_CACHE_HOME: path.join(temporaryRoot, 'xdg-cache'),
      XDG_CONFIG_HOME: path.join(temporaryRoot, 'xdg-config'),
      XDG_DATA_HOME: path.join(temporaryRoot, 'xdg-data'),
      npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
      npm_config_store_dir: pnpmStore,
      DSH_HOME: dshHome,
      DSH_AIAH_COMMAND: resolvedAiah,
    };
    options = { cwd: temporaryRoot, env: environment };
    const pnpm = await runner(pnpmWrapper, ['--version'], options);
    pnpmVersion = String(pnpm.stdout).trim();
    same(pnpmVersion, EXPECTED.pnpmVersion, 'pnpm version');
    const version = await runner(resolvedDsh, ['--version'], options);
    dshVersion = String(version.stdout).trim();
    same(dshVersion, EXPECTED.dshVersion, 'DSH version');
    await runner(resolvedDsh, ['plugin', '--profile', EXPECTED.profile, 'add', '-w', localTarball], options);
    const store = await runner(pnpmWrapper, ['store', 'path'], {
      ...options,
      cwd: path.join(dshHome, 'profiles', EXPECTED.profile),
    });
    const resolvedStore = await realpath(String(store.stdout).trim());
    const storeRelative = path.relative(temporaryRoot, resolvedStore);
    if (storeRelative === '' || storeRelative === '..' || storeRelative.startsWith(`..${path.sep}`) || path.isAbsolute(storeRelative)) {
      fail('pnpm store escaped the disposable root');
    }
    const installedList = await runner(resolvedDsh, ['plugin', '--profile', EXPECTED.profile, 'list'], options);
    const installedConfig = await runner(resolvedDsh, ['--profile', EXPECTED.profile, '--dump-config'], options);
    const serverRows = String(installedConfig.stdout).match(/serverName:\s*aiah\b/g) ?? [];
    if (!packageListHasExactIdentity(installedList.stdout)) fail('disposable profile expected exactly one installed package row');
    if (serverRows.length !== 1) fail(`disposable profile expected one aiah config row, got ${serverRows.length}`);
    const installedPackageDirectory = path.join(
      dshHome,
      'profiles',
      EXPECTED.profile,
      'node_modules',
      '@dff652',
      'dsh-ai-asset-hub',
    );
    const installedManifest = path.join(installedPackageDirectory, 'package.json');
    const resolvedManifest = await realpath(installedManifest);
    const manifestRelative = path.relative(temporaryRoot, resolvedManifest);
    if (manifestRelative === '' || manifestRelative === '..' || manifestRelative.startsWith(`..${path.sep}`) || path.isAbsolute(manifestRelative)) {
      fail('installed package manifest escaped the disposable root');
    }
    const manifest = JSON.parse(await readFile(resolvedManifest, 'utf8'));
    same(manifest.name, EXPECTED.packageName, 'installed package name');
    same(manifest.version, EXPECTED.packageVersion, 'installed package version');
    same(manifest.dsh?.bundle?.patch, './cordis.patch.yml', 'installed package bundle patch');

    await runner(resolvedDsh, ['plugin', '--profile', EXPECTED.profile, 'remove', '-w', EXPECTED.packageName], options);
    removed = true;
    const removedList = await runner(resolvedDsh, ['plugin', '--profile', EXPECTED.profile, 'list'], options);
    const removedConfig = await runner(resolvedDsh, ['--profile', EXPECTED.profile, '--dump-config'], options);
    if (String(removedList.stdout).includes(EXPECTED.packageName)) fail('package remains after disposable removal');
    if (/serverName:\s*aiah\b/.test(String(removedConfig.stdout))) fail('aiah config remains after disposable removal');
    await requirePathAbsent(installedPackageDirectory, 'installed package directory');

    return {
      status: 'PASS',
      profile: EXPECTED.profile,
      dshVersion,
      pnpmVersion,
      exactReleaseTarball: true,
      workspaceRootFlag: true,
      installedExactlyOnce: true,
      removalClean: true,
      isolatedDshHome: true,
      isolatedPnpmStore: true,
    };
  } finally {
    if (!removed && options !== null) {
      try {
        await runner(resolvedDsh, ['plugin', '--profile', EXPECTED.profile, 'remove', '-w', EXPECTED.packageName], options);
      } catch {
        // The entire test-owned home is removed below; preserve the primary failure.
      }
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function parseArguments(argv) {
  const options = {
    catalogUrl: EXPECTED.catalogUrl,
    report: null,
    dshBin: null,
    aiahCommand: null,
    pnpmCli: null,
    listingOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--listing-only') {
      options.listingOnly = true;
      continue;
    }
    if (!['--catalog-url', '--report', '--dsh-bin', '--aiah-command', '--pnpm-cli'].includes(flag)) fail(`unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`);
    index += 1;
    if (flag === '--catalog-url') options.catalogUrl = value;
    if (flag === '--report') options.report = value;
    if (flag === '--dsh-bin') options.dshBin = value;
    if (flag === '--aiah-command') options.aiahCommand = value;
    if (flag === '--pnpm-cli') options.pnpmCli = value;
  }
  const runtimeInputs = [options.dshBin, options.aiahCommand, options.pnpmCli];
  if (!runtimeInputs.every((value) => value === null) && !runtimeInputs.every((value) => value !== null)) {
    fail('--dsh-bin, --aiah-command and --pnpm-cli must be supplied together');
  }
  const hasRuntime = runtimeInputs.every((value) => value !== null);
  if (options.listingOnly && hasRuntime) fail('--listing-only cannot be combined with runtime inputs');
  if (!options.listingOnly && !hasRuntime) fail('full verification requires --dsh-bin, --aiah-command and --pnpm-cli; use --listing-only for catalog-only verification');
  return options;
}

function reportPathFromArguments(argv) {
  const indexes = argv.flatMap((value, index) => (value === '--report' ? [index] : []));
  if (indexes.length !== 1) return null;
  const value = argv[indexes[0] + 1];
  return value === undefined || value.startsWith('--') ? null : value;
}

async function validateReportParent(file) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) fail('--report parent must be a regular directory');
  return absolute;
}

export async function invalidateReport(file) {
  const absolute = await validateReportParent(file);
  const stale = `${absolute}.${process.pid}.stale`;
  try {
    await rename(absolute, stale);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  await unlink(stale);
}

export async function writeReportAtomic(file, report) {
  const absolute = await validateReportParent(file);
  const temporary = `${absolute}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, absolute);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function exitCodeForStatus(status) {
  if (status === 'PASS') return 0;
  if (status === 'NOT_COVERED') return 2;
  return 1;
}

export async function execute(argv, dependencies = {}) {
  const options = parseArguments(argv);
  const listingVerifier = dependencies.verifyListing ?? verifyListing;
  const profileVerifier = dependencies.verifyDisposableProfile ?? verifyDisposableProfile;
  const { listing, artifact } = await listingVerifier(fetch, options.catalogUrl);
  const disposableProfile = options.listingOnly
    ? { status: 'NOT_COVERED', reason: 'explicit --listing-only mode does not perform isolated install/remove' }
    : await profileVerifier({ ...options, artifact });
  if (!options.listingOnly) same(disposableProfile.status, 'PASS', 'disposable profile status');
  return {
    schemaVersion: 1,
    status: options.listingOnly ? 'NOT_COVERED' : 'PASS',
    scope: options.listingOnly ? 'listing-only' : 'listing-and-disposable-install-remove',
    generatedAt: new Date().toISOString(),
    listing,
    disposableProfile,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const reportPath = reportPathFromArguments(argv);
  if (reportPath !== null) await invalidateReport(reportPath);
  let report;
  try {
    report = await execute(argv);
  } catch (error) {
    if (reportPath !== null) {
      const failure = {
        schemaVersion: 1,
        status: 'FAIL',
        generatedAt: new Date().toISOString(),
        error: String(error.message).slice(0, 2000),
      };
      try {
        await writeReportAtomic(reportPath, failure);
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
