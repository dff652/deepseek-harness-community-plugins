import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  apply,
  handleApiMethod,
  invokeMailTool,
  isTrustedApiRequest,
  mailStatus,
} from '../packages/dsh-agent-mail-ui/index.js';
import {
  API_PREFIX,
  DEFAULT_DONE_BODY,
  HUMAN_ONLY_TOOLS,
  PROXY_TOOLS,
  TAB_ID,
  canAck,
  inboxItems,
  parseToolPayload,
  publicToolName,
  quoteComposerText,
  threadMessages,
  unreadBadge,
  validateSendPayload,
} from '../packages/dsh-agent-mail-ui/view.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'packages', 'dsh-agent-mail-ui');
const execFileAsync = promisify(execFile);

const PACKED_FILES = [
  'LICENSE',
  'NOTICE',
  'README.md',
  'client.js',
  'cordis.patch.yml',
  'index.js',
  'package.json',
  'view.js',
];

function toolsCtx(handlers) {
  return {
    get(name) {
      if (name !== 'tools') return undefined;
      return {
        get(toolName) {
          const execute = handlers[toolName];
          return execute ? { execute } : undefined;
        },
      };
    },
  };
}

test('manifest is an independent UI package with a plain bundle patch', async () => {
  const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@dff652/dsh-agent-mail-ui');
  assert.equal(manifest.version, '0.1.3');
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository.directory, 'packages/dsh-agent-mail-ui');
  assert.deepEqual(manifest.dsh.bundle, { patch: './cordis.patch.yml' });
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.deepEqual(manifest.peerDependencies, {
    '@deepseek-ai/dsh-mcp-client': '0.1.1-rc.2',
  });
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(manifest.files, [
    'index.js',
    'client.js',
    'view.js',
    'cordis.patch.yml',
    'README.md',
    'LICENSE',
    'NOTICE',
  ]);
});

test('bundle patch is a hot-mountable insert and does not spawn MCP', async () => {
  const patch = await readFile(path.join(packageDir, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /id: dsh-agent-mail-ui/);
  assert.match(patch, /name: '@dff652\/dsh-agent-mail-ui'/);
  assert.doesNotMatch(patch, /!!js/);
  assert.doesNotMatch(patch, /DSH_AGENT_MAIL_COMMAND/);
  assert.doesNotMatch(patch, /agent-mail-mcp/);
  assert.match(patch, /does not start a second MCP child/);
});

test('UI helpers present inbox rows and composer quotes', () => {
  const items = inboxItems({
    items: [
      {
        message_id: 'm1',
        thread_id: 't1',
        task_id: 'k1',
        type: 'task',
        from: 'codex@local',
        body_md: 'hello',
        effect_level: 'read',
        delivery_status: 'pending',
        unread: true,
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].messageId, 'm1');
  assert.equal(items[0].effect, 'read');
  assert.equal(items[0].deliveryStatus, 'pending');
  assert.equal(unreadBadge(items), 1);
  assert.match(quoteComposerText(items[0]), /message_id=m1/);
  assert.equal(TAB_ID, 'dsh-agent-mail:inbox');
});

test('task Ack stays disabled until an exact terminal task outcome is known', () => {
  const [task] = inboxItems({
    items: [{
      message_id: 'm1',
      thread_id: 't1',
      task_id: 'k1',
      type: 'task',
      from: 'codex@local',
      body_md: 'handle this',
      delivery_status: 'claimed',
    }],
  });
  assert.equal(task.deliveryStatus, 'claimed');
  assert.equal(canAck(task, []), false);
  assert.equal(
    canAck(task, threadMessages({ messages: [{ id: 'm2', type: 'done', task_id: 'other' }] })),
    false,
  );
  assert.equal(
    canAck(task, threadMessages({ messages: [{ id: 'm2', type: 'done', task_id: 'k1' }] })),
    true,
  );
  assert.equal(DEFAULT_DONE_BODY, 'done');
});

test('write send requires an explicit confirm flag', () => {
  assert.equal(validateSendPayload({ to: 'codex@local', body: 'x', effect: 'write' }).error, 'write effect requires confirmWrite');
  assert.deepEqual(
    validateSendPayload({ to: 'codex@local', body: 'x', effect: 'read' }).args,
    { to: 'codex@local', type: 'task', body: 'x', effect: 'read' },
  );
});

test('apply waits for webServer via inject instead of skipping the host API', () => {
  const registered = [];
  const ctx = {
    get() {
      return undefined;
    },
    inject(deps, callback) {
      assert.ok(deps.includes('webServer'));
      const host = {
        webServer: {
          register(route) {
            registered.push(route);
            return () => {};
          },
        },
        get(name) {
          return name === 'webServer' ? this.webServer : undefined;
        },
        effect(factory) {
          return factory();
        },
      };
      callback(host);
      return () => {};
    },
  };
  apply(ctx);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, 'prefix');
  assert.equal(registered[0].path, API_PREFIX);
});

test('apply stays headless-safe when webServer never appears', () => {
  apply({
    get() {
      return undefined;
    },
    inject() {
      return () => {};
    },
  });
});

test('host reuses the registered MCP tool execute path', async () => {
  const calls = [];
  const ctx = toolsCtx({
    [publicToolName('comm_inbox')]: async (args, exec) => {
      calls.push({ args, aborted: exec.signal.aborted });
      return { structuredContent: { count: 0, items: [] } };
    },
  });
  const result = await invokeMailTool(ctx, 'comm_inbox', { unread_only: true });
  assert.equal(result.count, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].aborted, false);
});

test('host turns raw MCP isError results into failed API calls', async () => {
  const ctx = toolsCtx({
    [publicToolName('comm_ack')]: async () => ({
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: 'task is not terminal' }) }],
    }),
  });
  await assert.rejects(
    () => invokeMailTool(ctx, 'comm_ack', { message_id: 'm1' }),
    (error) => error?.code === 'mcp-tool-error'
      && error?.status === 502
      && /task is not terminal/.test(error.message),
  );
});

test('host never proxies human-only approval tools', async () => {
  const ctx = toolsCtx({
    [publicToolName('comm_approve')]: async () => ({ ok: true }),
    [publicToolName('comm_reject')]: async () => ({ ok: true }),
  });
  await assert.rejects(() => invokeMailTool(ctx, 'comm_approve', { approval_id: 'a1' }), /human-only/);
  await assert.rejects(() => invokeMailTool(ctx, 'comm_reject', { approval_id: 'a1' }), /human-only/);
  assert.deepEqual(HUMAN_ONLY_TOOLS, ['comm_approve', 'comm_reject']);
  assert.ok(!PROXY_TOOLS.includes('comm_approve'));
});

test('status is offline when the MCP namespace is missing and does not throw', () => {
  const status = mailStatus({ get() { return undefined; } });
  assert.equal(status.live, false);
  assert.equal(status.autoWake, false);
  assert.equal(status.proxy, 'existing-mcp-child');
  assert.ok(status.missing.includes(publicToolName('comm_inbox')));
});

test('API send write without confirmWrite fails closed', async () => {
  await assert.rejects(
    () => handleApiMethod({ get() { return undefined; } }, 'send', {
      to: 'codex@local',
      body: 'secret write',
      effect: 'write',
    }),
    /confirmWrite/,
  );
});

test('trust fence allows loopback and rejects cross-site', () => {
  assert.equal(isTrustedApiRequest({ headers: { host: 'localhost:3080' } }), true);
  assert.equal(isTrustedApiRequest({ headers: { host: 'example.invalid' } }), false);
  assert.equal(isTrustedApiRequest({
    headers: { host: 'localhost:3080', 'sec-fetch-site': 'cross-site' },
  }), false);
});

test('parseToolPayload prefers structuredContent', () => {
  assert.deepEqual(parseToolPayload({ structuredContent: { count: 2 } }), { count: 2 });
  assert.deepEqual(parseToolPayload({ content: [{ type: 'text', text: '{"ok":true}' }] }), { ok: true });
});

test('client registers a sidebar tab rather than a top-right window button', async () => {
  const client = await readFile(path.join(packageDir, 'client.js'), 'utf8');
  const view = await readFile(path.join(packageDir, 'view.js'), 'utf8');
  assert.match(client, /window\.__ModuleLoader__\.load/);
  assert.match(client, /id: '@dff652\/dsh-agent-mail-ui'/);
  assert.match(client, /require\('react'\)/);
  assert.doesNotMatch(client, /from 'react'/);
  assert.match(client, /registerTab/);
  assert.match(client, /id: TAB_ID/);
  assert.match(client, /standalone/);
  assert.match(client, /ctx\.inject\(\['betterSidebar'\]/);
  assert.match(client, /const inject = \[\];/);
  assert.match(view, /dsh-agent-mail:inbox/);
  assert.doesNotMatch(client, /toggleCluster/);
  assert.doesNotMatch(client, /IconPanelRight/);
  assert.match(client, /Quote to chat/);
  assert.match(client, /human@local/);
  const source = await readFile(path.join(packageDir, 'client-src.js'), 'utf8');
  assert.match(source, /appendToDraft\(ctx, sessionId/);
  assert.match(source, /appendToDraft\(pluginCtx, sessionId/);
  assert.match(source, /DEFAULT_DONE_BODY/);
  assert.match(source, /Ack is available after Done, Error, or Cancel/);
  assert.match(source, /Check & Ack/);
  assert.match(source, /await refresh\(false\)/);
  assert.doesNotMatch(source, /already claimed is not fatal/);
});

test('client.js factory stays generated from client-src.js', async () => {
  await execFileAsync('node', [path.join(packageDir, 'build-client.mjs'), '--check']);
});

test('package sources stay inside the public boundary', async () => {
  const files = ['index.js', 'client.js', 'view.js', 'README.md', 'NOTICE', 'cordis.patch.yml'];
  for (const name of files) {
    const body = await readFile(path.join(packageDir, name), 'utf8');
    assert.doesNotMatch(body, /\/home\//, name);
    assert.doesNotMatch(body, /192\.168\./, name);
    assert.doesNotMatch(body, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i, name);
  }
});

test('npm pack dry-run ships only the declared allowlist', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-ui-public-npm-cache.'));
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache],
      { cwd: packageDir },
    );
    const reports = JSON.parse(stdout);
    const files = reports[0].files.map((item) => item.path).sort();
    assert.deepEqual(files, PACKED_FILES);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});
