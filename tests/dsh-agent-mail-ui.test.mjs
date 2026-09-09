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
  agentList,
  canAck,
  currentSessionId,
  deliveryStatusLabel,
  diagnoseSummary,
  firstLine,
  inboxItems,
  messageTypeLabel,
  parseToolPayload,
  publicToolName,
  quoteComposerText,
  sessionScope,
  taskOutcome,
  taskOutcomeLabel,
  threadParticipants,
  threadSubject,
  threadMessages,
  toolCardModel,
  toolResultText,
  unreadBadge,
  validateSendPayload,
} from '../packages/dsh-agent-mail-ui/view.js';
import {
  ManagementController,
  RECOVERY_STORAGE_KEY,
} from '../packages/dsh-agent-mail-ui/management-view.js';

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
  assert.equal(manifest.version, '0.1.7');
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

test('unread state follows pending and claimed delivery, excluding acked all-mail rows', () => {
  const items = inboxItems({
    items: ['pending', 'claimed', 'acked'].map((delivery_status, index) => ({
      message_id: `m${index}`,
      delivery_status,
      unread: true,
    })),
  });
  assert.deepEqual(items.map((item) => item.unread), [true, true, false]);
  assert.deepEqual(items.map((item) => item.claimed), [false, true, false]);
  assert.equal(unreadBadge(items), 2);
});

test('recipient data uses only provider roster IDs and does not invent presence', () => {
  const ids = agentList({
    agents: ['ui-harness@local', 'peer-b@local', 'human@local'],
  });
  assert.deepEqual(ids, ['ui-harness@local', 'peer-b@local', 'human@local']);
  assert.equal(ids.includes('online'), false);
  assert.equal(ids.includes('connected'), false);
});

test('UI state labels keep mailbox delivery separate from client presence and task outcome', () => {
  assert.equal(messageTypeLabel('task'), '任务');
  assert.equal(messageTypeLabel('message'), '消息');
  assert.equal(deliveryStatusLabel('outbound'), '已提交到邮箱 · 签收状态未知');
  assert.equal(deliveryStatusLabel(''), '状态未知');
  assert.equal(firstLine('first line\nsecond line'), 'first line');

  const [task] = inboxItems({
    items: [{
      message_id: 'm-state',
      thread_id: 't-state',
      task_id: 'k-state',
      type: 'task',
      from: 'worker@local',
      to: 'ui@local',
      body_md: 'Handle the first line\nwith more context',
      delivery_status: 'claimed',
    }],
  });
  const tailed = threadMessages({ messages: [
    { id: 'm-state', type: 'task', from: 'worker@local', to: 'ui@local', body_md: task.body },
    { id: 'm-done', type: 'done', from: 'ui@local', to: 'worker@local', body_md: 'done' },
  ] });
  assert.equal(tailed[1].deliveryStatus, '');
  assert.equal(taskOutcome(task, []), 'unknown');
  assert.equal(taskOutcome({ ...task, deliveryStatus: 'acked' }, []), 'acked');
  assert.equal(taskOutcome(task, tailed), 'unknown', 'tail without task_id cannot prove completion');
  assert.equal(taskOutcome(task, tailed, new Set(['k-state'])), 'done');
  assert.equal(taskOutcomeLabel('unknown'), '完成状态未知（待核实）');
  assert.equal(taskOutcomeLabel('acked'), '已结束（已签收）');
  assert.equal(threadSubject({ ...task, body: 'done' }, tailed), 'Handle the first line');
  assert.deepEqual(threadParticipants(task, tailed), ['worker@local', 'ui@local']);
});

test('standalone Quote scope follows current session navigation and rejects stale ids', () => {
  const first = {
    ids: ['session-a', 'session-b'],
    byId: { 'session-a': { sessionId: 'session-a' }, 'session-b': { sessionId: 'session-b' } },
    current: 'session-a',
  };
  const second = { ...first, current: 'session-b' };
  assert.equal(currentSessionId(first), 'session-a');
  assert.deepEqual(sessionScope(first), { sessionId: 'session-a' });
  assert.equal(currentSessionId(second), 'session-b');
  assert.deepEqual(sessionScope(second), { sessionId: 'session-b' });
  assert.deepEqual(sessionScope({ ...second, current: 'session-stale' }), {});
  assert.deepEqual(sessionScope({ ids: first.ids, byId: first.byId }), {});
});

test('tool cards consume DSH rc.2 owner.block lifecycle and preserve send failures', () => {
  const toolName = publicToolName('comm_send');
  const running = toolCardModel(toolName, {
    callId: 'call-1',
    name: 'comm_send',
    argsRaw: '{}',
    subCalls: [],
  });
  assert.equal(running.state, 'running');
  assert.deepEqual(running.payload, {});

  const successBlock = {
    kind: 'tool-result',
    callId: 'call-1',
    call: { name: 'comm_send', argsRaw: '{}' },
    content: [{ type: 'text', text: JSON.stringify({ message_id: 'm-1', thread_id: 't-1' }) }],
    isError: false,
    subCalls: [],
  };
  const success = toolCardModel(toolName, successBlock);
  assert.equal(success.state, 'ok');
  assert.equal(success.payload.message_id, 'm-1');
  assert.match(toolResultText(successBlock), /message_id/);

  const failedBlock = {
    ...successBlock,
    content: [{ type: 'text', text: JSON.stringify({ error: 'delivery rejected' }) }],
    isError: true,
    error: { name: 'McpError', code: 'mcp-tool-error' },
  };
  const failed = toolCardModel(toolName, failedBlock);
  assert.equal(failed.state, 'error');
  assert.equal(failed.payload.error, 'delivery rejected');
  assert.notEqual(failed.state, 'ok', 'a failed send must never render as success');
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
  assert.deepEqual(
    validateSendPayload({ to: 'codex@local', type: 'message', body: 'x', effect: 'read' }).args,
    { to: 'codex@local', type: 'message', body: 'x', effect: 'read' },
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
  assert.equal(status.clientPresence, 'unknown');
  assert.equal(status.deliveryReceipts, 'unavailable');
  assert.equal(status.manualRefresh, true);
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
  assert.match(client, /const inject = \['sessions'\];/);
  assert.match(view, /dsh-agent-mail:inbox/);
  assert.doesNotMatch(client, /toggleCluster/);
  assert.doesNotMatch(client, /IconPanelRight/);
  assert.match(client, /引用到对话/);
  assert.match(client, /human@local/);
  const source = await readFile(path.join(packageDir, 'client-src.js'), 'utf8');
  assert.match(source, /export const inject = \['sessions'\];/);
  assert.match(source, /appendToDraft\(ctx, sessionId/);
  assert.match(source, /appendToDraft\(pluginCtx, sessionId/);
  assert.match(source, /useSyncExternalStore/);
  assert.match(source, /list\.subscribe/);
  assert.match(source, /owner\?\.block/);
  assert.doesNotMatch(source, /snap\?\.items\?\.\[0\]/);
  assert.match(source, /DEFAULT_DONE_BODY/);
  assert.match(source, /任务完成、报错或取消后才可以确认收悉/);
  assert.match(source, /检查并确认收悉/);
  assert.match(source, /'aria-label': '调整收件箱与详情高度'/);
  assert.match(source, /客户端连接：未知/);
  assert.match(source, /仅显示本次面板打开期间的本地发送记录/);
  assert.match(source, /await refresh\(false\)/);
  assert.doesNotMatch(source, /already claimed is not fatal/);
});

test('management controller pairs, persists safe recovery metadata, restores, and activates', async () => {
  const calls = [];
  const storageData = new Map();
  const storage = {
    getItem(key) { return storageData.get(key) ?? null; },
    setItem(key, value) { storageData.set(key, value); },
    removeItem(key) { storageData.delete(key); },
  };
  let authenticated = false;
  let state = 'context_ready';
  const profile = {
    handle: 'profile-alpha',
    label: 'Alpha profile',
    endpoints: ['https://hub.fixture.test'],
  };
  const session = () => authenticated
    ? {
      authenticated: true,
      csrf_token: 'csrf-only-in-memory',
      expires_at: '2099-01-01T00:00:00.000Z',
      profiles: [profile],
    }
    : { authenticated: false };
  const enrollment = () => ({
    state,
    enrollment_handle: state === 'context_ready' ? undefined : 'enrollment-1',
    agent_id: state === 'context_ready' ? undefined : 'joined-alpha@fixture',
    expires_at: '2099-01-01T00:00:00.000Z',
    save_state: state === 'saved' || state === 'active' ? 'saved' : 'unsaved',
    activation_state: state === 'active' ? 'active' : state === 'saved' ? 'restart_required' : 'pending',
    config_revision: state === 'saved' || state === 'active' ? 'revision-2' : 'revision-1',
    commit_id: state === 'saved' || state === 'active' ? 'commit-1' : undefined,
  });
  const fetchImpl = async (path, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ path, payload, headers: options.headers });
    if (path === '/v1/management-session/status') {
      return { ok: true, status: 200, json: async () => ({ ok: true, value: session() }) };
    }
    if (path === '/v1/management-session/login') {
      assert.equal(payload.password, 'fixture-password');
      authenticated = true;
      return { ok: true, status: 200, json: async () => ({ ok: true, value: session() }) };
    }
    assert.equal(options.headers['X-Agent-Mail-CSRF'], 'csrf-only-in-memory');
    if (path.endsWith('/begin')) {
      assert.deepEqual(payload, { profile_handle: 'profile-alpha', endpoint: 'https://hub.fixture.test' });
      state = 'context_ready';
      return { ok: true, status: 200, json: async () => ({ ok: true, value: {
        context_handle: 'context-1',
        observed_config_revision: 'revision-1',
        expires_at: '2099-01-01T00:00:00.000Z',
        target_label: 'Alpha profile',
        endpoint: 'https://hub.fixture.test',
      } }) };
    }
    if (path.endsWith('/redeem')) {
      assert.equal(payload.code, 'PAIR-ALPHA-6');
      state = 'pending_save';
      return { ok: true, status: 200, json: async () => ({ ok: true, value: enrollment() }) };
    }
    if (path.endsWith('/status')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, value: enrollment() }) };
    }
    if (path.endsWith('/commit')) {
      assert.deepEqual(payload, {
        profile_handle: 'profile-alpha',
        enrollment_handle: 'enrollment-1',
        expected_config_revision: 'revision-1',
        confirmed_agent_id: 'joined-alpha@fixture',
      });
      state = 'saved';
      return { ok: true, status: 200, json: async () => ({ ok: true, value: enrollment() }) };
    }
    if (path.endsWith('/activate')) {
      state = 'active';
      return { ok: true, status: 200, json: async () => ({ ok: true, value: enrollment() }) };
    }
    throw new Error(`unexpected management request: ${path}`);
  };

  const controller = new ManagementController({ fetchImpl, storage });
  await controller.status();
  assert.equal(controller.getSnapshot().managementStatus, 'unauthenticated');
  assert.equal(await controller.login('fixture-password'), true);
  assert.equal(await controller.begin(), true);
  assert.equal(controller.getSnapshot().enrollment.phase, 'context_ready');
  assert.equal(await controller.redeem('PAIR-ALPHA-6'), true);
  assert.equal(controller.getSnapshot().enrollment.phase, 'pending_save');
  const recovery = JSON.parse(storageData.get(RECOVERY_STORAGE_KEY));
  assert.deepEqual(Object.keys(recovery).sort(), [
    'context_handle',
    'enrollment_handle',
    'observed_config_revision',
    'profile_handle',
    'request_id',
  ]);
  assert.equal('password' in recovery, false);
  assert.equal('code' in recovery, false);
  assert.equal('csrf_token' in recovery, false);
  assert.equal('agent_id' in recovery, false);

  assert.equal(await controller.commit(true), true);
  assert.equal(controller.getSnapshot().enrollment.phase, 'saved');
  assert.equal(controller.getSnapshot().enrollment.activationState, 'restart_required');

  const restored = new ManagementController({ fetchImpl, storage });
  await restored.status();
  await restored.login('fixture-password');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(restored.getSnapshot().enrollment.phase, 'saved');
  assert.equal(restored.getSnapshot().enrollment.agentId, 'joined-alpha@fixture');
  assert.equal(await restored.activate(), true);
  assert.equal(restored.getSnapshot().enrollment.phase, 'active');
  assert.equal(storageData.has(RECOVERY_STORAGE_KEY), false);
  assert.equal(calls.some((call) => call.path.endsWith('/redeem')), true);
  assert.equal(calls.filter((call) => call.path.endsWith('/redeem')).length, 1);
});

test('management UI source exposes stable connection and enrollment selectors', async () => {
  const source = await readFile(path.join(packageDir, 'client-src.js'), 'utf8');
  for (const action of [
    'connection-management',
    'login',
    'begin-enrollment',
    'redeem',
    'commit',
    'activate',
    'refresh-enrollment',
    'cancel-enrollment',
    'open-recipients',
  ]) {
    assert.match(source, new RegExp(`data-agent-mail-action.*${action}`));
  }
  for (const field of ['management-password', 'profile', 'endpoint', 'pairing-code', 'confirm-identity']) {
    assert.match(source, new RegExp(`data-agent-mail-field.*${field}`));
  }
  assert.match(source, /登录管理宿主/);
  assert.match(source, /开始配对/);
  assert.match(source, /验证配对码/);
  assert.match(source, /保存连接/);
  assert.match(source, /检查激活/);
  assert.match(source, /查看收件人并发送只读测试任务/);
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


test('remote diagnosis uses the Hub-authenticated identity and never a local environment fallback', () => {
  assert.equal(diagnoseSummary({ agent_id_env: 'local@fixture' }).agentId, 'local@fixture');
  assert.equal(diagnoseSummary({ remote: true, mode: 'remote_mail_api', agent_id: 'remote@fixture', agent_id_env: 'stale@fixture' }).agentId, 'remote@fixture');
  assert.equal(diagnoseSummary({ remote: true, agent_id_env: 'stale@fixture' }).agentId, '');
  assert.equal(diagnoseSummary({ remote: true, agent_id: '' }).agentId, '');
});
