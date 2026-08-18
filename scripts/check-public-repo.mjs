#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const failures = [];

const privateBoundaryRules = [
  ['absolute Linux home', /\/home\//],
  ['absolute root home', /\/root\//],
  ['absolute macOS home', /\/Users\//],
  ['file URI path', /\bfile:\/\/[^\s"'`<>]+/i],
  ['Windows drive path', /(?:^|[\s"'`(])[A-Za-z]:[\\/][^\s"'`<>|]+/m],
  ['Windows UNC path', /(?:^|[\s"'`(])(?:\\\\|\/\/)[^\s\\/]+[\\/][^\s"'`<>|]+/m],
  [
    'private IPv4 address',
    /(?:^|[^\d])(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(?:[^\d]|$)/,
  ],
  ['private Agent Mail data path', /\.agent-mail(?:\/|\\|\b)/i],
  ['private AgentMemory data path', /\.agentmemory(?:\/|\\|\b)/i],
  [
    'assigned AgentMemory secret',
    /AGENTMEMORY_SECRET\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{12,}/,
  ],
  ['PEM private material', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['bearer credential', /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i],
  [
    'assigned secret',
    /(?:^|[,{\s])['"]?(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|token|authorization)['"]?\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{12,}/im,
  ],
];

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)));
    else if (entry.isFile()) files.push(absolute);
    else if (!entry.isFile()) failures.push(`${relative(absolute)}: unsupported filesystem entry`);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

for (const file of await listFiles(root)) {
  const body = await readFile(file);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    failures.push(`${relative(file)}: unreviewed binary content`);
    continue;
  }
  const fileName = relative(file);
  if (fileName !== 'scripts/check-public-repo.mjs') {
    for (const [name, pattern] of privateBoundaryRules) {
      if (pattern.test(text)) failures.push(`${fileName}: ${name}`);
    }
  }
  if (text.split(/\r?\n/).some((line) => /[\t ]+$/.test(line))) {
    failures.push(`${fileName}: trailing whitespace`);
  }

  if (path.extname(file).toLowerCase() === '.md') {
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      const linked = path.resolve(path.dirname(file), target);
      try {
        const linkedStat = await stat(linked);
        if (!linkedStat.isFile() && !linkedStat.isDirectory()) throw new Error('unsupported type');
      } catch {
        failures.push(`${fileName}: missing relative link ${target}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('public repository boundary, whitespace and relative links: PASS');
