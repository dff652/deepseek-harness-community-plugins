import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);

export function resolveDsh(label = 'Agent Mail host acceptance') {
  if (process.env.DSH_BIN) return process.env.DSH_BIN;
  try {
    return execFileSync('/usr/bin/which', ['dsh'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(
      `${label} requires a reviewed dsh executable; set DSH_BIN or add dsh to PATH`,
      { cause: error },
    );
  }
}

export async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export function toolEnv(env) {
  return {
    ...env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || process.env.PATH || ''}`,
  };
}

export async function resolveReviewedProvider(work, identity) {
  const commandEnv = String(process.env.DSH_AGENT_MAIL_COMMAND || '').trim();
  if (commandEnv) {
    assert.equal(commandEnv.startsWith('/'), true, 'DSH_AGENT_MAIL_COMMAND must be an absolute path');
    const cli = String(process.env.DSH_AGENT_MAIL_CLI || '').trim() || commandEnv.replace(/-mcp$/, '');
    return { command: commandEnv, cli, pattern: commandEnv };
  }

  const tarball = String(process.env.DSH_AGENT_MAIL_TARBALL || '').trim();
  if (!tarball.startsWith('/')) {
    throw new Error(
      'set DSH_AGENT_MAIL_COMMAND or DSH_AGENT_MAIL_TARBALL to a reviewed absolute path',
    );
  }
  assert.equal(await sha256File(tarball), identity.dsh101TarballSha256, 'provider tarball digest mismatch');

  const prefix = path.join(work, 'agent-mail-provider');
  await execFileAsync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--prefix', prefix, tarball],
    { timeout: 180000 },
  );
  const command = path.join(prefix, 'node_modules', '.bin', 'agent-mail-mcp');
  const cli = path.join(prefix, 'node_modules', '.bin', 'agent-mail');
  const entry = path.join(prefix, 'node_modules', 'agent-mail', 'dist', 'mcp', 'stdio.js');
  assert.equal(await sha256File(entry), identity.mcpEntrySha256, 'provider MCP entry digest mismatch');
  return { command, cli, pattern: prefix };
}

export async function initMailHome(cli, parentDir, extraAgents = []) {
  const project = path.join(parentDir, 'project');
  await mkdir(project, { recursive: true });
  const before = new Set(await readdir(project));
  await execFileAsync(cli, ['init', '--path', project], { timeout: 30000 });
  const created = (await readdir(project, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && !before.has(entry.name),
  );
  assert.equal(created.length, 1, 'provider init must create exactly one home directory');
  const home = path.join(project, created[0].name);
  if (extraAgents.length > 0) {
    const rosterPath = path.join(home, 'agents.json');
    const roster = JSON.parse(await readFile(rosterPath, 'utf8'));
    for (const id of extraAgents) {
      if (!roster.agents.some((agent) => agent.id === id)) {
        roster.agents.push({ id, display_name: id, skills: ['dsh'] });
      }
    }
    roster.updated_at = new Date().toISOString();
    await writeFile(rosterPath, `${JSON.stringify(roster, null, 2)}\n`);
  }
  return { project, home };
}

export function mailEnv(home, agentId, command, extra = {}) {
  return {
    ...process.env,
    AGENT_MAIL_HOME: home,
    AGENT_MAIL_ID: agentId,
    DSH_AGENT_MAIL_COMMAND: command,
    DSH_AGENT_MAIL_HOME: home,
    DSH_AGENT_MAIL_ID: agentId,
    DSH_AGENT_MAIL_HUB_URL: '',
    ...extra,
  };
}

export async function runDsh(dshBin, args, env, cwd, timeoutMs = 30000) {
  try {
    const result = await execFileAsync(dshBin, args, {
      cwd,
      env: toolEnv(env),
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code === 'ENOENT' ? 127 : (error.status ?? 1),
      stdout: error.stdout ?? '',
      stderr: `${error.stderr ?? ''}${error.message ?? ''}`,
    };
  }
}

export async function pidsMatching(pattern) {
  const { stdout } = await execFileAsync('/bin/ps', ['-eo', 'pid=,args=']);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(pattern))
    .map((line) => Number(line.split(/\s+/, 1)[0]))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

export async function descendantPidsMatching(rootPid, pattern) {
  const { stdout } = await execFileAsync('/bin/ps', ['-eo', 'pid=,ppid=,args=']);
  const rows = stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] }));
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }
  descendants.delete(rootPid);
  return rows
    .filter((row) => descendants.has(row.pid) && row.args.includes(pattern))
    .map((row) => row.pid);
}

export function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

export async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${label}`);
}

export async function stopProcessGroup(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      resolve();
    }, 8000);
    child.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export class McpClient {
  constructor(command, args, env, timeoutMs = 15000) {
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.buffer = '';
    this.pending = new Map();
    this.stderr = '';
    this.child = spawn(command, args, {
      shell: false,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.pid = this.child.pid;
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('close', (code, signal) => {
      this.exit = { code, signal };
      if (this.pending.size > 0) {
        this.failAll(new Error(`mcp child exited ${code ?? signal}: ${this.stderr}`));
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
        reject(new Error(`MCP ${method} timed out: ${this.stderr}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async initialize(clientInfo = { name: 'dsh-agent-mail-host', version: '0.1.0' }) {
    const result = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo,
    });
    this.notify('notifications/initialized', {});
    return result;
  }

  async close() {
    this.failAll(new Error('client closed'));
    if (!this.child.killed) {
      try {
        this.child.stdin.end();
      } catch {
        /* ignore */
      }
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

export function parseTool(result) {
  const text = (result.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  const body = text ? JSON.parse(text) : {};
  return { isError: Boolean(result.isError), body };
}

export async function startSession(command, home, agentId) {
  const client = new McpClient(command, [], mailEnv(home, agentId, command));
  const initialize = await client.initialize();
  const listed = await client.request('tools/list');
  return { client, initialize, tools: (listed.tools ?? []).map((tool) => tool.name) };
}

export function writeDupPatch(filePath, rowId, serverName) {
  return writeFile(
    filePath,
    `- insert:
    - id: ${rowId}
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: ${serverName}
        transport: stdio
        command: !!js process.env.DSH_AGENT_MAIL_COMMAND
        args: []
        env:
          AGENT_MAIL_HOME: !!js process.env.DSH_AGENT_MAIL_HOME
          AGENT_MAIL_ID: !!js process.env.DSH_AGENT_MAIL_ID
        toolCallTimeoutMs: 60000
        failOnStartupError: true
`,
  );
}

export async function cleanupDir(dir) {
  await rm(dir, { recursive: true, force: true });
}
