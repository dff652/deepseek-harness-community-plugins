import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiMethod } from '../packages/dsh-agent-mail-ui/index.js';
import { inboxItems, threadMessages } from '../packages/dsh-agent-mail-ui/view.js';
import {
  initMailHome,
  parseTool,
  resolveReviewedProvider,
  startSession,
} from '../scripts/lib/agent-mail-host.mjs';

// Real provider acceptance through the UI dispatcher, not a DSH browser test.
// All messages and provider processes belong to this disposable home.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/agent-mail-provider-identity.json'), 'utf8',
));
const expectedProviderVersion = process.env.DSH_AGENT_MAIL_EXPECTED_VERSION ?? identity.versionLabel;
assert.ok(
  ['1.0.0-alpha.4', '1.0.0-alpha.7'].includes(expectedProviderVersion),
  'DSH_AGENT_MAIL_EXPECTED_VERSION must name a reviewed exact fixture version',
);
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-ui-mcp.'));
const origin = 'ui-origin@local';
const assignee = 'ui-assignee@local';
let sender;
let recipient;

function uiContext(session) {
  const tools = {
    get(publicName) {
      const tool = publicName.replace(/^mcp__agent-mail__/, '');
      return session.tools.includes(tool) ? { execute() {} } : undefined;
    },
    async execute({ callId, name: publicName, arguments: args, signal }) {
      assert.match(callId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        'dispatch includes a UUID call id');
      assert.ok(signal instanceof AbortSignal, 'dispatch includes cancellation');
      const tool = publicName.replace(/^mcp__agent-mail__/, '');
      assert.ok(session.tools.includes(tool), 'dispatches a registered tool');
      const result = await session.client.request('tools/call', { name: tool, arguments: args });
      const parsed = parseTool(result);
      if (parsed.isError) {
        return {
          isError: true,
          error: { message: publicName + ' failed' },
          content: [],
        };
      }
      return { isError: false, value: result, content: result.content ?? [] };
    },
  };
  return {
    get(name) { return name === 'tools' ? tools : undefined; },
  };
}

try {
  const provider = await resolveReviewedProvider(work, identity);
  const { home } = await initMailHome(provider.cli, work, [origin, assignee]);
  sender = await startSession(provider.command, home, origin);
  recipient = await startSession(provider.command, home, assignee);
  assert.equal(recipient.initialize.serverInfo.name, 'agent-mail');
  assert.equal(recipient.initialize.serverInfo.version, expectedProviderVersion);
  const senderCtx = uiContext(sender);
  const recipientCtx = uiContext(recipient);
  assert.equal((await handleApiMethod(recipientCtx, 'status')).live, true);

  const sent = await handleApiMethod(senderCtx, 'send', {
    to: assignee, type: 'task', body: 'Disposable UI acceptance task', effect: 'read',
  });
  const inbox = inboxItems(await handleApiMethod(recipientCtx, 'inbox'));
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].messageId, sent.id);
  assert.equal(inbox[0].taskId, sent.task_id);
  assert.equal(inbox[0].deliveryStatus, 'pending');
  assert.equal(inbox[0].effect, 'read');
  const message = { message_id: sent.id };
  assert.equal((await handleApiMethod(recipientCtx, 'claim', message)).status, 'claimed');
  assert.equal(inboxItems(await handleApiMethod(recipientCtx, 'inbox'))[0].deliveryStatus, 'claimed');
  // The provider renews a claim owned by the same identity without error.
  assert.equal((await handleApiMethod(recipientCtx, 'claim', message)).status, 'claimed');
  await assert.rejects(
    () => handleApiMethod(recipientCtx, 'ack', message),
    (error) => error.code === 'mcp-tool-error',
  );
  const done = await handleApiMethod(recipientCtx, 'send', {
    to: origin, type: 'done', body: 'done', effect: 'read',
    thread_id: sent.thread_id, task_id: sent.task_id,
  });
  assert.equal(done.type, 'done');
  const thread = threadMessages(await handleApiMethod(recipientCtx, 'tail', {
    thread_id: sent.thread_id,
  }));
  assert.ok(thread.some((entry) => entry.messageId === done.id && entry.type === 'done'));
  // Both reviewed provider versions omit task/thread IDs from comm_tail; do
  // not infer task completion merely because a done message shares a thread.
  assert.ok(thread.every((entry) => entry.taskId === '' && entry.threadId === ''));
  assert.equal((await handleApiMethod(recipientCtx, 'ack', message)).status, 'acked');
  assert.equal(inboxItems(await handleApiMethod(recipientCtx, 'inbox')).length, 0);
  const allMail = inboxItems(await handleApiMethod(recipientCtx, 'inbox', { unread_only: false }));
  const acknowledged = allMail.find((entry) => entry.messageId === sent.id);
  assert.ok(acknowledged, 'all-mail retains the acknowledged task');
  assert.equal(acknowledged.deliveryStatus, 'acked');
  assert.equal(acknowledged.unread, false);
  await assert.rejects(
    () => handleApiMethod(recipientCtx, 'claim', message),
    (error) => error.code === 'mcp-tool-error',
  );
  await assert.rejects(() => handleApiMethod(recipientCtx, 'claim', {
    message_id: 'missing-ui-acceptance-message',
  }));
  console.log(`Agent Mail UI real MCP: PASS (${expectedProviderVersion}; ToolRuntime dispatch, claim renewal, premature Ack rejection, Done -> Ack, acknowledged all-mail state, claim failures)`);
} finally {
  await Promise.all([sender?.client.close(), recipient?.client.close()]);
  await rm(work, { recursive: true, force: true });
}
