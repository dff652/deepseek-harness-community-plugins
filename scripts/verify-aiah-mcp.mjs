#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsFixture = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'aiah-tools.json'), 'utf8'),
);
const EXPECTED_TOOLS = toolsFixture.tools;
const FORBIDDEN_TOOLS = toolsFixture.forbiddenTools;

function usage() {
  console.error(
    'Usage: node scripts/verify-aiah-mcp.mjs --command /absolute/path/aiah ' +
      '[--testdata-root /absolute/aiah/testdata] [--timeout-ms 20000]',
  );
}
function parseArgs(argv) {
  const options = { timeoutMs: 20000 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`missing value for ${key}`);
    index += 1;
    if (key === '--command') options.command = value;
    else if (key === '--testdata-root') options.testdataRoot = value;
    else if (key === '--timeout-ms') options.timeoutMs = Number(value);
    else throw new Error(`unknown option: ${key}`);
  }
  if (!options.command?.startsWith('/')) {
    throw new Error('--command must be an absolute executable path');
  }
  if (options.testdataRoot && !options.testdataRoot.startsWith('/')) {
    throw new Error('--testdata-root must be an absolute directory');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be an integer >= 1000');
  }
  return options;
}

function runArgv(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timed out: ${command} ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited ${code ?? signal}: ${stderr}`));
    });
  });
}

class McpClient {
  constructor(command, args, timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.buffer = '';
    this.pending = new Map();
    this.child = spawn(command, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.stderr = '';
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('close', (code, signal) => {
      if (this.pending.size > 0) {
        this.failAll(new Error(`mcp child exited ${code ?? signal} with pending requests`));
      }
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id === undefined) continue;
      const pending = this.pending.get(message.id);
      if (!pending) throw new Error(`unexpected MCP id ${message.id}`);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async close() {
    this.failAll(new Error('client closed'));
    if (!this.child.killed) {
      this.child.stdin.end();
      this.child.kill('SIGTERM');
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL');
        resolve();
      }, 2000);
      this.child.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function copyTree(source, destination) {
  await cp(source, destination, { recursive: true });
}

async function snapshotTree(rootDir) {
  const snapshot = {};
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    const relative = path.relative(rootDir, current) || '.';
    const info = await stat(current);
    snapshot[relative.split(path.sep).join('/')] = `dir:${(info.mode & 0o777).toString(8).padStart(4, '0')}`;
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const fileInfo = await stat(full);
        const body = await readFile(full);
        const digest = createHash('sha256').update(body).digest('hex');
        const rel = path.relative(rootDir, full).split(path.sep).join('/');
        snapshot[rel] = `file:${(fileInfo.mode & 0o777).toString(8).padStart(4, '0')}:${digest}`;
      } else {
        const rel = path.relative(rootDir, full).split(path.sep).join('/');
        snapshot[rel] = `other:${entry.name}`;
      }
    }
  }
  await walk(rootDir);
  return snapshot;
}

function treeDiff(before, after) {
  const lines = [];
  for (const [filePath, value] of Object.entries(after)) {
    if (!(filePath in before)) lines.push(`created: ${filePath}`);
    else if (before[filePath] !== value) lines.push(`modified: ${filePath}`);
  }
  for (const filePath of Object.keys(before)) {
    if (!(filePath in after)) lines.push(`removed: ${filePath}`);
  }
  return lines;
}

function parseToolText(result) {
  if (result?.isError) throw new Error(`tool error: ${JSON.stringify(result)}`);
  const text = (result.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  return JSON.parse(text);
}

async function prepareFixtures(command, testdataRoot, timeoutMs) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-aiah-zero-write.'));
  const home = path.join(work, 'home');
  const project = path.join(work, 'project');
  const workspace = path.join(work, 'workspace');
  const validateWorkspace = path.join(work, 'validate-workspace');
  const packageDir = path.join(work, 'package');
  const channel = path.join(work, 'channel');
  const evidence = path.join(workspace, '.aiah', 'evidence');

  await mkdir(project, { recursive: true });
  await mkdir(packageDir, { recursive: true });
  await mkdir(channel, { recursive: true });
  await copyTree(path.join(testdataRoot, 'home-basic'), home);
  await copyTree(path.join(testdataRoot, 'workspace-valid'), workspace);
  await copyTree(path.join(testdataRoot, 'workspace-2b'), validateWorkspace);
  await mkdir(evidence, { recursive: true });

  const built = await runArgv(
    command,
    [
      'build',
      '--manifest',
      path.join(workspace, 'manifest.yaml'),
      '--profile',
      'personal',
      '--out',
      packageDir,
      '--output',
      'json',
    ],
    timeoutMs,
  );
  const buildReport = JSON.parse(built.stdout);
  if (buildReport.ok !== true || !buildReport.package?.archive) {
    throw new Error(`build did not produce a package: ${built.stdout}`);
  }
  const archive = buildReport.package.archive;
  const pkg = path.isAbsolute(archive) ? archive : path.join(packageDir, archive);

  await runArgv(
    command,
    ['publish', '--package', pkg, '--channel', channel, '--output', 'json'],
    timeoutMs,
  );

  return {
    work,
    roots: {
      home,
      project,
      workspace,
      validateWorkspace,
      package: packageDir,
      channel,
      evidence,
    },
    pkg,
  };
}

async function callReadOnlySurface(client, fixtures) {
  const calls = {
    aiah_asset_status: {
      workspace: fixtures.roots.workspace,
      home: fixtures.roots.home,
      project: fixtures.roots.project,
    },
    aiah_scan: { home: fixtures.roots.home, project: fixtures.roots.project },
    aiah_validate: {
      manifest: path.join(fixtures.roots.validateWorkspace, 'manifest.yaml'),
    },
    aiah_diff: {
      package: fixtures.pkg,
      home: fixtures.roots.home,
      project: fixtures.roots.project,
    },
    aiah_doctor: { home: fixtures.roots.home, project: fixtures.roots.project },
    aiah_migration_status: {
      workspace: fixtures.roots.workspace,
      channel: fixtures.roots.channel,
      home: fixtures.roots.home,
      project: fixtures.roots.project,
    },
    aiah_migration_readiness: {
      workspace: fixtures.roots.workspace,
      profile: 'personal',
      home: fixtures.roots.home,
      project: fixtures.roots.project,
    },
    aiah_version: {},
  };

  const reports = {};
  for (const name of EXPECTED_TOOLS) {
    const arguments_ = calls[name];
    if (!arguments_) throw new Error(`missing arguments for ${name}`);
    reports[name] = parseToolText(await client.request('tools/call', { name, arguments: arguments_ }));
  }
  return reports;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new McpClient(options.command, ['mcp'], options.timeoutMs);
  let fixtures;
  const report = {
    status: 'FAIL',
    server: {},
    protocolVersion: null,
    toolCount: 0,
    tools: [],
    readOnly: true,
    zeroWrite: null,
    canary: null,
  };

  try {
    const initialize = await client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dsh-aiah-verifier', version: '0.1.1' },
    });
    client.notify('notifications/initialized', {});
    report.protocolVersion = initialize.protocolVersion;
    report.server = initialize.serverInfo ?? {};
    const listed = await client.request('tools/list');
    const names = (listed.tools ?? []).map((tool) => tool.name);
    report.tools = names;
    report.toolCount = names.length;
    if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
      throw new Error(`tools/list drifted: ${JSON.stringify(names)}`);
    }
    for (const tool of listed.tools ?? []) {
      if (FORBIDDEN_TOOLS.includes(tool.name)) {
        throw new Error(`forbidden tool advertised: ${tool.name}`);
      }
    }

    const version = parseToolText(await client.request('tools/call', { name: 'aiah_version', arguments: {} }));
    report.canary = version.producedBy ?? version.version;
    report.server.version = version.version;
    report.server.commit = version.commit;

    if (options.testdataRoot) {
      fixtures = await prepareFixtures(options.command, options.testdataRoot, options.timeoutMs);
      const before = {};
      for (const [name, rootDir] of Object.entries(fixtures.roots)) {
        before[name] = await snapshotTree(rootDir);
      }
      const reports = await callReadOnlySurface(client, fixtures);
      const mutations = {};
      for (const [name, rootDir] of Object.entries(fixtures.roots)) {
        const diff = treeDiff(before[name], await snapshotTree(rootDir));
        if (diff.length > 0) mutations[name] = diff;
      }
      if (Object.keys(mutations).length > 0) {
        throw new Error(`zero-write invariant failed: ${JSON.stringify(mutations)}`);
      }
      report.zeroWrite = {
        passed: true,
        trees: Object.keys(fixtures.roots),
        called: Object.keys(reports),
      };
    }

    report.status = 'PASS';
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await client.close();
    if (fixtures?.work) await rm(fixtures.work, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
