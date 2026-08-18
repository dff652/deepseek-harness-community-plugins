#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

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

function parseArgs(argv) {
  const options = { ignoreSigterm: false, stderr: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--ignore-sigterm') {
      options.ignoreSigterm = true;
      continue;
    }
    if (!value) throw new Error(`missing value for ${key}`);
    index += 1;
    if (key === '--store') options.store = value;
    else if (key === '--stderr') options.stderr = value;
    else throw new Error(`unknown option: ${key}`);
  }
  if (!options.store || options.store.charAt(0) !== '/') {
    throw new Error('--store must be an absolute path');
  }
  return options;
}

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function sendError(id, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: message }] } })}\n`,
  );
}

function toolDescriptor(name) {
  const properties = { project: { type: 'string' } };
  const required = [];
  if (name === 'memory_save') {
    properties.content = { type: 'string' };
    properties.type = { type: 'string' };
    required.push('content', 'project');
  }
  if (name === 'memory_recall') {
    properties.query = { type: 'string' };
    properties.limit = { type: 'number' };
    properties.format = { type: 'string' };
    required.push('query');
  }
  return { name, inputSchema: { type: 'object', properties, required } };
}

async function loadStore(storePath) {
  try {
    return JSON.parse(await readFile(storePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { nextId: 1, observations: [] };
    throw error;
  }
}

async function saveStore(storePath, store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function observationText(observation) {
  return [observation.id, observation.type, observation.project, observation.content]
    .filter(Boolean)
    .join('\n');
}

function explicitProject(value) {
  const project = String(value ?? '').trim();
  return project || '';
}

const options = parseArgs(process.argv.slice(2));
if (options.ignoreSigterm) {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
}
if (options.stderr) process.stderr.write(options.stderr);

const input = createInterface({ input: process.stdin });
input.on('line', async (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  try {
    if (request.method === 'initialize') {
      send(request.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'fake-agentmemory', version: 'test' },
      });
      return;
    }
    if (request.method === 'notifications/initialized') return;
    if (request.method === 'tools/list') {
      send(request.id, { tools: EXPECTED_TOOLS.map(toolDescriptor) });
      return;
    }
    if (request.method !== 'tools/call') {
      sendError(request.id, `unsupported method ${request.method}`);
      return;
    }

    const name = request.params?.name;
    const args = request.params?.arguments ?? {};
    if (!EXPECTED_TOOLS.includes(name)) {
      sendError(request.id, `unknown tool ${name}`);
      return;
    }

    if (name === 'memory_save') {
      const project = explicitProject(args.project);
      const content = String(args.content ?? '');
      if (!project) {
        sendError(request.id, 'memory_save requires an explicit stable project');
        return;
      }
      if (!content.trim()) {
        sendError(request.id, 'memory_save requires content');
        return;
      }
      const store = await loadStore(options.store);
      const observation = {
        id: `mem_fixture_${String(store.nextId).padStart(4, '0')}`,
        type: String(args.type ?? 'decision'),
        project,
        content,
      };
      store.nextId += 1;
      store.observations.push(observation);
      await saveStore(options.store, store);
      send(request.id, {
        content: [{ type: 'text', text: JSON.stringify({ success: true, id: observation.id, project }) }],
      });
      return;
    }

    if (name === 'memory_recall') {
      const query = String(args.query ?? '').trim();
      if (!query) {
        sendError(request.id, 'memory_recall requires query');
        return;
      }
      const project = explicitProject(args.project);
      const store = await loadStore(options.store);
      const ranked = store.observations
        .filter((item) => !project || item.project === project)
        .map((observation) => {
          const haystack = observationText(observation);
          const score = haystack.includes(query) ? 1 : 0.1;
          return { observation, score };
        })
        .sort((left, right) => right.score - left.score || left.observation.id.localeCompare(right.observation.id));
      const limit = Number.isInteger(args.limit) ? args.limit : 5;
      send(request.id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              truncated: false,
              results: ranked.slice(0, limit),
            }),
          },
        ],
      });
      return;
    }

    if (name === 'memory_diagnose') {
      send(request.id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ summary: { fail: 0, pass: 1, warning: 0 } }),
          },
        ],
      });
      return;
    }

    send(request.id, {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, tool: name }) }],
    });
  } catch (error) {
    sendError(request.id, error.message);
  }
});
