import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  execFileAsync,
  McpClient,
  pidExists,
  pidsMatching,
  descendantPidsMatching,
  resolveDsh,
  runDsh,
  stopProcessGroup,
  toolEnv,
  waitFor,
} from './agent-mail-host.mjs';

const fakeAdapterPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'agentmemory-fake-stdio.mjs',
);

export {
  execFileAsync,
  McpClient,
  pidExists,
  pidsMatching,
  descendantPidsMatching,
  resolveDsh,
  runDsh,
  stopProcessGroup,
  toolEnv,
  waitFor,
};

export function agentmemoryEnv(command, extra = {}) {
  return {
    ...process.env,
    DSH_AGENTMEMORY_COMMAND: command,
    ...extra,
  };
}

export async function writeFakeAdapterCommand(directory, storePath, extraArgs = []) {
  await mkdir(directory, { recursive: true });
  const command = path.join(directory, 'agentmemory-stdio-adapter');
  const quotedArgs = [fakeAdapterPath, '--store', storePath, ...extraArgs]
    .map((value) => `'${String(value).replaceAll("'", "'\\''")}'`)
    .join(' ');
  await writeFile(
    command,
    `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' ${quotedArgs}\n`,
  );
  await chmod(command, 0o755);
  return command;
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
        command: !!js process.env.DSH_AGENTMEMORY_COMMAND
        args: []
        failOnStartupError: true
`,
  );
}

export async function seedStore(storePath, observations) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const store = {
    nextId: observations.length + 1,
    observations: observations.map((item, index) => ({
      id: item.id ?? `mem_fixture_${String(index + 1).padStart(4, '0')}`,
      type: item.type ?? 'decision',
      project: item.project,
      content: item.content,
      text: item.text,
      narrative: item.narrative,
      facts: item.facts,
      title: item.title,
    })),
  };
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
  return store;
}

export async function startFakeSession(command) {
  const client = new McpClient(command, [], process.env);
  const initialize = await client.initialize({
    name: 'dsh-agentmemory-host',
    version: '0.1.0',
  });
  const listed = await client.request('tools/list');
  return { client, initialize, tools: (listed.tools ?? []).map((tool) => tool.name) };
}
