import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleApiMethod } from '../packages/dsh-agent-mail/ui-host.js';
import { sentItems } from '../packages/dsh-agent-mail/view.js';
import { pathToFileURL } from 'node:url';
import { execFileAsync, initMailHome, parseTool, resolveReviewedProvider, startSession } from '../scripts/lib/agent-mail-host.mjs';

const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-unified-receipts.'));
const fixture = JSON.parse(await readFile(new URL('./fixtures/agent-mail-provider-identity.json', import.meta.url), 'utf8'));
const origin = 'receipt-origin@local';
const recipient = 'receipt-recipient@local';
const stranger = 'receipt-stranger@local';
const sessions = new Set();
let hub;
function context(session) {
  return { get(name) {
    if (name !== 'tools') return undefined;
    return { get(publicName) {
      const name = publicName.replace(/^mcp__agent-mail__/, '');
      if (!session.tools.includes(name)) return undefined;
      return { async execute(args) {
        const result = await session.client.request('tools/call', { name, arguments: args });
        const parsed = parseTool(result);
        if (parsed.isError) throw new Error(JSON.stringify(parsed.body));
        return result;
      } };
    } };
  } };
}
try {
  const provider = await resolveReviewedProvider(work, fixture);
  const { home } = await initMailHome(provider.cli, work, [origin, recipient, stranger]);
  const clientHomes = new Map();
  let restartHub;
  if (process.env.AGENT_MAIL_ACCEPTANCE_PROVIDER_DIR) {
    const dir = process.env.AGENT_MAIL_ACCEPTANCE_PROVIDER_DIR;
    assert.ok(path.isAbsolute(dir), 'provider package directory must be absolute');
    const api = await import(pathToFileURL(path.join(dir, 'dist/index.js')));
    const cert = path.join(work, 'hub-cert.pem');
    const key = path.join(work, 'hub-key.pem');
    await execFileAsync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1']);
    const options = { home, host: '127.0.0.1', port: 0, requireAuth: true,
      tlsCertFile: cert, tlsKeyFile: key };
    hub = await api.listenHub(options);
    options.port = Number(new URL(hub.url).port);
    restartHub = async () => { hub = await api.listenHub(options); };
    for (const id of [origin, recipient, stranger]) {
      const client = await initMailHome(provider.cli, path.join(work, id.split('@')[0]), [id]);
      const tokenFile = path.join(client.home, 'acceptance-token');
      await writeFile(tokenFile, api.mintToken(home, id), { mode: 0o600 });
      api.setConnection(client.home, { hub_url: hub.url, token_file: tokenFile, ca_file: cert });
      clientHomes.set(id, client.home);
    }
  }
  async function open(id) {
    const session = await startSession(provider.command, clientHomes.get(id) ?? home, id,
      { AGENT_MAIL_HUB_URL: hub?.url ?? '' });
    sessions.add(session);
    return { session, ctx: context(session) };
  }
  let sender = await open(origin);
  const receiver = await open(recipient);
  const other = await open(stranger);
  assert.ok(sender.session.tools.includes('comm_sent'), 'provider must expose durable sent history');
  // Details must work before the first message is sent.
  const details = await handleApiMethod(sender.ctx, 'agent-details', { agent_id: recipient });
  assert.equal(details.agent_id, recipient);
  assert.equal(details.device_ip, null);
  assert.equal(details.connection, 'unknown');
  const created = await handleApiMethod(sender.ctx, 'send', {
    to: recipient, type: 'task', body: 'Durable unified receipt acceptance', effect: 'read',
  });
  async function ownReceipt() {
    const result = await handleApiMethod(sender.ctx, 'sent');
    const row = result.items.find((entry) => entry.message_id === created.id);
    assert.ok(row, 'sent history retains the original message');
    const ui = sentItems(result, origin).items.find((entry) => entry.messageId === created.id);
    assert.equal(ui?.deliveryStatus, row.status, 'UI must display the provider-derived sender status');
    return row;
  }
  assert.equal((await ownReceipt()).status, 'submitted');
  assert.equal((await handleApiMethod(other.ctx, 'sent')).items.length, 0);
  if (restartHub) {
    await new Promise((resolve) => hub.server.close(resolve));
    await assert.rejects(ownReceipt, 'disconnected Hub must not fabricate a receipt');
    await restartHub();
    assert.equal((await ownReceipt()).status, 'submitted');
  }
  await sender.session.client.close();
  sessions.delete(sender.session);
  sender = await open(origin);
  assert.equal((await ownReceipt()).body_md, 'Durable unified receipt acceptance');
  await handleApiMethod(receiver.ctx, 'claim', { message_id: created.id });
  const claimed = await ownReceipt();
  assert.ok(['claimed', 'processing'].includes(claimed.status));
  assert.equal(claimed.delivery_status, 'claimed');
  const done = await handleApiMethod(receiver.ctx, 'send', {
    to: origin, type: 'done', body: 'Receipt acceptance completed', effect: 'read',
    thread_id: created.thread_id, task_id: created.task_id,
  });
  assert.equal((await ownReceipt()).status, 'completed');
  const receiverSent = await handleApiMethod(receiver.ctx, 'sent');
  assert.equal(receiverSent.items.find((item) => item.message_id === done.id).status, 'submitted',
    'completed task must not imply its done notification was received');
  await handleApiMethod(receiver.ctx, 'ack', { message_id: created.id });
  await sender.session.client.close();
  sessions.delete(sender.session);
  sender = await open(origin);
  assert.equal((await ownReceipt()).status, 'completed');
  assert.equal((await ownReceipt()).delivery_status, 'acked');
  console.log(`PASS: unified API sender isolation, pre-send details, durable restart, claim/done/ack receipts${restartHub ? ', separate client homes over authenticated TLS and Hub disconnect/restart' : ''}`);
} finally {
  await Promise.all([...sessions].map(({ client }) => client.close()));
  if (hub?.server.listening) await new Promise((resolve) => hub.server.close(resolve));
  await rm(work, { recursive: true, force: true });
}
