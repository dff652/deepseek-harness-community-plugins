import {
  API_METHODS,
  API_PREFIX,
  HUMAN_ONLY_TOOLS,
  isHumanOnlyTool,
  isProxyTool,
  parseToolPayload,
  publicToolName,
  validateSendPayload,
} from './view.js';

export const name = '@dff652/dsh-agent-mail-ui';
export { API_METHODS, HUMAN_ONLY_TOOLS };

const MAX_BODY_BYTES = 1 << 20;
const TOOL_TIMEOUT_MS = 60000;

export function apply(ctx) {
  const webServer = ctx.get('webServer');
  if (webServer === undefined) return;

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req, ctx.get('webRuntime')?.trustedHosts ?? [])) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
        return;
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
        return;
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
      const method = pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(API_PREFIX.length + 1) : '';
      try {
        const payload = await readJsonBody(req);
        const result = await handleApiMethod(ctx, method, payload);
        writeJson(res, 200, { ok: true, value: result });
      } catch (error) {
        const code = error?.code ?? 'internal';
        const status = error?.status ?? (code === 'mcp-unavailable' ? 503 : 400);
        writeJson(res, status, {
          ok: false,
          error: { code, message: error instanceof Error ? error.message : String(error) },
        });
      }
    },
  }));
}

export async function handleApiMethod(ctx, method, payload = {}) {
  if (!API_METHODS.includes(method)) {
    throw apiError('not-found', `unknown method "${method}"`, 404);
  }
  if (method === 'status') return mailStatus(ctx);
  if (method === 'diagnose') return invokeMailTool(ctx, 'comm_diagnose', {});
  if (method === 'agents') return invokeMailTool(ctx, 'comm_list_agents', {});
  if (method === 'inbox') {
    return invokeMailTool(ctx, 'comm_inbox', { unread_only: payload.unread_only !== false });
  }
  if (method === 'claim') {
    return invokeMailTool(ctx, 'comm_claim', { message_id: requireId(payload.message_id, 'message_id') });
  }
  if (method === 'ack') {
    return invokeMailTool(ctx, 'comm_ack', { message_id: requireId(payload.message_id, 'message_id') });
  }
  if (method === 'tail') {
    return invokeMailTool(ctx, 'comm_tail', { thread_id: requireId(payload.thread_id, 'thread_id') });
  }
  if (method === 'approvals') {
    return invokeMailTool(ctx, 'comm_approvals', { status: payload.status ?? 'pending' });
  }
  if (method === 'send') {
    const checked = validateSendPayload(payload);
    if (checked.error) throw apiError('bad-request', checked.error, 400);
    return invokeMailTool(ctx, 'comm_send', checked.args);
  }
  throw apiError('not-found', `unknown method "${method}"`, 404);
}

export function mailStatus(ctx) {
  const tools = ctx.get('tools');
  const missing = [];
  for (const rawName of ['comm_diagnose', 'comm_inbox', 'comm_send']) {
    if (tools?.get?.(publicToolName(rawName)) === undefined) missing.push(publicToolName(rawName));
  }
  return {
    live: missing.length === 0,
    missing,
    proxy: 'existing-mcp-child',
    autoWake: false,
  };
}

export async function invokeMailTool(ctx, rawName, args) {
  if (isHumanOnlyTool(rawName)) {
    throw apiError('forbidden', `${rawName} is human-only and is not proxied`, 403);
  }
  if (!isProxyTool(rawName)) {
    throw apiError('forbidden', `${rawName} is not a UI proxy tool`, 403);
  }
  const tools = ctx.get('tools');
  const definition = tools?.get?.(publicToolName(rawName));
  if (definition?.execute == null) {
    throw apiError('mcp-unavailable', `${publicToolName(rawName)} is not registered`, 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const value = await definition.execute(args, {
      signal: controller.signal,
      deferContext() {},
      concludeTurn() {},
    });
    return parseToolPayload(value);
  } finally {
    clearTimeout(timer);
  }
}

export function isTrustedApiRequest(request, trustedHosts = []) {
  const host = header(request?.headers, 'host');
  if (!host) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(request.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    try {
      const entryUrl = new URL(`http://${entry}`);
      return entryUrl.port === ''
        ? entryUrl.hostname === hostUrl.hostname
        : entryUrl.host === hostUrl.host;
    } catch {
      return false;
    }
  });
}

function header(headers, name) {
  const value = headers?.[name];
  return typeof value === 'string' ? value : undefined;
}

function requireId(value, field) {
  const id = String(value ?? '').trim();
  if (!id) throw apiError('bad-request', `${field} is required`, 400);
  return id;
}

function apiError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw apiError('bad-request', 'request body too large', 400);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw apiError('bad-request', 'request body is not valid JSON', 400);
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export default { apply };
