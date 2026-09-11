// Keep the compatibility UI package and the unified bundle on the same source.
// No provider implementation is included in either package.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../packages/dsh-agent-mail-ui/', import.meta.url);
const target = new URL('../packages/dsh-agent-mail/', import.meta.url);
const files = [
  ['index.js', 'ui-host.js'],
  ['view.js', 'view.js'],
  ['client.js', 'client.js'],
];
for (const [input, output] of files) {
  let body = await readFile(new URL(input, source), 'utf8');
  body = body.replaceAll("'@dff652/dsh-agent-mail-ui'", "'@dff652/dsh-agent-mail'");
  const destination = new URL(output, target);
  if (process.argv.includes('--check')) {
    if (await readFile(destination, 'utf8') !== body) {
      throw new Error(`${fileURLToPath(destination)} is stale; run npm run build:agent-mail`);
    }
  } else {
    await writeFile(destination, body);
  }
}
