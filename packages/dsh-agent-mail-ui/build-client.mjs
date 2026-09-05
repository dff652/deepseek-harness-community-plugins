import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(dir, 'client.js');

function stripExports(source) {
  return source.replace(/^export /gm, '');
}

function indent(source) {
  return source
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `\t\t${line.replace(/[ \t]+$/g, '')}`))
    .join('\n');
}

async function renderClientBundle() {
  const view = stripExports(await readFile(path.join(dir, 'view.js'), 'utf8')).trimEnd();
  let src = await readFile(path.join(dir, 'client-src.js'), 'utf8');
  src = src.replace(/^import[\s\S]*?from 'react';\n/, '');
  src = src.replace(/^import[\s\S]*?from 'react-dom\/client';\n/, '');
  src = src.replace(/^import[\s\S]*?from '\.\/view\.js';\n+/, '');
  src = stripExports(src).trimEnd();
  return [
    'window.__ModuleLoader__.load({',
    "\tid: '@dff652/dsh-agent-mail-ui',",
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    "\t\tconst { createElement: h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = require('react');",
    "\t\tconst { createRoot } = require('react-dom/client');",
    indent(view),
    indent(src),
    '\t\texports.apply = apply;',
    '\t\texports.inject = inject;',
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n');
}

const bundle = await renderClientBundle();
if (process.argv.includes('--check')) {
  const actual = await readFile(target, 'utf8');
  if (actual !== bundle) {
    console.error('client.js is stale; run node packages/dsh-agent-mail-ui/build-client.mjs');
    process.exit(1);
  }
} else {
  await writeFile(target, bundle);
}
