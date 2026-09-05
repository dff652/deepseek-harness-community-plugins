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
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-ui-mcp.'));
const origin = 'ui-origin@local';
const assignee = 'ui-assignee@local';
let sender;
let recipient;

function uiContext(session) {
  return {
    get(name) {
      if (name !== 'tools') return undefined;
      return {
        get(publicName) {
          const tool = publicName.replace(/^mcp__agent-mail__/, '');
          if (!session.tools.includes(tool)) return undefined;
          return {
            async execute(args) {
              const result = await session.client.request('tools/call', {
                name: tool, arguments: args,
              });
              // Match DSH MCP executor semantics: tool failures throw.
              const parsed = parseTool(result);
              if (parsed.isError) throw new Error(JSON.stringify(parsed.body));
              return result;
            },
          };
        },
      };
    },
  };
}

try {
  const provider = await resolveReviewedProvider(work, identity);
  const { home } = await initMailHome(provider.cli, work, [origin, assignee]);
  sender = await startSession(provider.command, home, origin);
  recipient = await startSession(provider.command, home, assignee);
  assert.equal(recipient.initialize.serverInfo.name, 'agent-mail');
  assert.match(recipient.initialize.serverInfo.version, /alpha\.4/);
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
  await assert.rejects(() => handleApiMethod(recipientCtx, 'ack', message), /not terminal/);
  const done = await handleApiMethod(recipientCtx, 'send', {
    to: origin, type: 'done', body: 'done', effect: 'read',
    thread_id: sent.thread_id, task_id: sent.task_id,
  });
  assert.equal(done.type, 'done');
  const thread = threadMessages(await handleApiMethod(recipientCtx, 'tail', {
    thread_id: sent.thread_id,
  }));
  assert.ok(thread.some((entry) => entry.messageId === done.id && entry.type === 'done'));
  // alpha.4 tail omits task/thread IDs; do not infer completion of another
  // task merely because a done message appears in the same thread.
  assert.ok(thread.every((entry) => entry.taskId === ''));
  assert.equal((await handleApiMethod(recipientCtx, 'ack', message)).status, 'acked');
  assert.equal(inboxItems(await handleApiMethod(recipientCtx, 'inbox')).length, 0);
  await assert.rejects(() => handleApiMethod(recipientCtx, 'claim', message), /already acked/);
  await assert.rejects(() => handleApiMethod(recipientCtx, 'claim', {
    message_id: 'missing-ui-acceptance-message',
  }));
  console.log('Agent Mail UI real MCP: PASS (claim renewal, premature Ack rejection, Done -> Ack, alpha.4 tail shape, claim failures)');
} finally {
  await Promise.all([sender?.client.close(), recipient?.client.close()]);
  await rm(work, { recursive: true, force: true });
}
