#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initMailHome,
  parseTool,
  pidsMatching,
  resolveReviewedProvider,
  startSession,
} from './lib/agent-mail-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsFixture = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-tools.json'), 'utf8'),
);
const identity = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-provider-identity.json'), 'utf8'),
);
const EXPECTED_TOOLS = toolsFixture.tools;
const SENDER = 'grok@local';
const RECIPIENT = 'codex@local';
const CANARY_BODY = 'DSH-EXPORT-CANARY-non-sensitive';

function usage() {
  console.error(
    'Usage: node scripts/verify-agent-mail-mcp.mjs ' +
      '[--command /absolute/path/agent-mail-mcp] [--tarball /absolute/path/provider.tgz] ' +
      '[--cli /absolute/path/agent-mail]',
  );
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`missing value for ${key}`);
    index += 1;
    if (key === '--command') options.command = value;
    else if (key === '--tarball') options.tarball = value;
    else if (key === '--cli') options.cli = value;
    else throw new Error(`unknown option: ${key}`);
  }
  if (options.command && !options.command.startsWith('/')) {
    throw new Error('--command must be an absolute executable path');
  }
  if (options.tarball && !options.tarball.startsWith('/')) {
    throw new Error('--tarball must be an absolute path');
  }
  if (options.cli && !options.cli.startsWith('/')) {
    throw new Error('--cli must be an absolute path');
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.command) process.env.DSH_AGENT_MAIL_COMMAND = options.command;
if (options.tarball) process.env.DSH_AGENT_MAIL_TARBALL = options.tarball;
if (options.cli) process.env.DSH_AGENT_MAIL_CLI = options.cli;

if (!process.env.DSH_AGENT_MAIL_COMMAND && !process.env.DSH_AGENT_MAIL_TARBALL) {
  usage();
  throw new Error('set --command/--tarball or DSH_AGENT_MAIL_COMMAND/DSH_AGENT_MAIL_TARBALL');
}

const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-verify.'));
let sender;
let recipient;
try {
  const provider = await resolveReviewedProvider(work, identity);
  const { home } = await initMailHome(provider.cli, work, [SENDER, RECIPIENT]);
  sender = await startSession(provider.command, home, SENDER);
  assert.equal(sender.initialize.serverInfo?.name, 'agent-mail');
  assert.match(String(sender.initialize.serverInfo?.version ?? ''), /1\.0\.0-alpha\.4|alpha\.4/);
  assert.deepEqual(sender.tools, EXPECTED_TOOLS);
  assert.equal(sender.tools.length, 11);

  const sent = parseTool(
    await sender.client.request('tools/call', {
      name: 'comm_send',
      arguments: {
        to: RECIPIENT,
        type: 'task',
        body: CANARY_BODY,
        effect: 'read',
      },
    }),
  );
  assert.equal(sent.isError, false);
  assert.ok(sent.body.id);
  assert.ok(sent.body.thread_id);
  assert.ok(sent.body.task_id);

  recipient = await startSession(provider.command, home, RECIPIENT);
  const inbox = parseTool(
    await recipient.client.request('tools/call', {
      name: 'comm_inbox',
      arguments: { unread_only: true },
    }),
  );
  assert.equal(inbox.isError, false);
  assert.equal(inbox.body.count, 1);
  assert.equal(inbox.body.items[0].message_id, sent.body.id);
  assert.match(inbox.body.items[0].body_md, /DSH-EXPORT-CANARY-non-sensitive/);

  const claimed = parseTool(
    await recipient.client.request('tools/call', {
      name: 'comm_claim',
      arguments: { message_id: sent.body.id },
    }),
  );
  assert.equal(claimed.isError, false);
  assert.equal(claimed.body.status, 'claimed');

  const done = parseTool(
    await recipient.client.request('tools/call', {
      name: 'comm_send',
      arguments: {
        to: SENDER,
        type: 'done',
        body: 'canary complete',
        thread_id: sent.body.thread_id,
        task_id: sent.body.task_id,
      },
    }),
  );
  assert.equal(done.isError, false);
  assert.equal(done.body.type, 'done');

  const acked = parseTool(
    await recipient.client.request('tools/call', {
      name: 'comm_ack',
      arguments: { message_id: sent.body.id },
    }),
  );
  assert.equal(acked.isError, false);
  assert.equal(acked.body.status, 'acked');

  const writeSent = parseTool(
    await sender.client.request('tools/call', {
      name: 'comm_send',
      arguments: {
        to: RECIPIENT,
        type: 'task',
        body: 'write canary',
        effect: 'write',
      },
    }),
  );
  assert.equal(writeSent.isError, false);
  assert.equal(writeSent.body.requires_human_approval, true);
  assert.ok(writeSent.body.approval_id);

  const approved = parseTool(
    await sender.client.request('tools/call', {
      name: 'comm_approve',
      arguments: { approval_id: writeSent.body.approval_id, note: 'should fail' },
    }),
  );
  assert.equal(approved.isError, true);
  assert.equal(approved.body.exit_code, 6);
  assert.match(String(approved.body.error), /only human@local may approve/);

  const rejected = parseTool(
    await sender.client.request('tools/call', {
      name: 'comm_reject',
      arguments: { approval_id: writeSent.body.approval_id, note: 'should fail' },
    }),
  );
  assert.equal(rejected.isError, true);
  assert.equal(rejected.body.exit_code, 6);
  assert.match(String(rejected.body.error), /only human@local may reject/);

  console.log('Agent Mail MCP verifier: PASS (11 tools, send/inbox/claim/done/ack, approval denial)');
} finally {
  await sender?.client.close();
  await recipient?.client.close();
  await rm(work, { recursive: true, force: true });
  if (process.env.DSH_AGENT_MAIL_COMMAND) {
    assert.deepEqual(await pidsMatching(process.env.DSH_AGENT_MAIL_COMMAND), []);
  }
}
