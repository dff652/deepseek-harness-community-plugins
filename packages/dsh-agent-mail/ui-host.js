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

export const name = '@dff652/dsh-agent-mail';
export { API_METHODS, HUMAN_ONLY_TOOLS };

const MAX_BODY_BYTES = 1 << 20;
const TOOL_TIMEOUT_MS = 60000;

export function apply(ctx) {
  // Cordis only exposes webServer after inject; a bare ctx.get() skips the API.
  if (typeof ctx.inject !== 'function') return;
  ctx.inject(['webServer'], (host) => {
    const webServer = host.webServer ?? host.get?.('webServer');
    if (webServer?.register == null) return;
    host.effect(() => webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        const trustedHosts = host.get?.('webRuntime')?.trustedHosts
          ?? ctx.get?.('webRuntime')?.trustedHosts
          ?? [];
        if (!isTrustedApiRequest(req, trustedHosts)) {
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
          const result = await handleApiMethod({
            get(name) {
              return host.get?.(name) ?? host[name] ?? ctx.get?.(name);
            },
          }, method, payload);
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
  });
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
  if (method === 'sent') {
    const args = {};
    if (payload.limit !== undefined) {
      const limit = Number(payload.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw apiError('bad-request', 'limit must be an integer between 1 and 100', 400);
      }
      args.limit = limit;
    }
    if (payload.before !== undefined) {
      if (typeof payload.before !== 'string' || payload.before.trim() === '') {
        throw apiError('bad-request', 'before must be a non-empty string', 400);
      }
      args.before = payload.before.trim();
    }
    return invokeMailTool(ctx, 'comm_sent', args);
  }
  if (method === 'agent-details') {
    return invokeMailTool(ctx, 'comm_agent_details', {
      agent_id: requireId(payload.agent_id, 'agent_id'),
    });
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
  const hasSentHistory = tools?.get?.(publicToolName('comm_sent')) !== undefined;
  const hasAgentDetails = tools?.get?.(publicToolName('comm_agent_details')) !== undefined;
  return {
    live: missing.length === 0,
    missing,
    proxy: 'existing-mcp-child',
    autoWake: false,
    clientPresence: 'unknown',
    deliveryReceipts: hasSentHistory ? 'available' : 'unavailable',
    manualRefresh: true,
    durableSentHistory: hasSentHistory ? 'available' : 'upgrade-required',
    recipientDetails: hasAgentDetails ? 'available' : 'upgrade-required',
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
    if (value?.isError === true) {
      const parsed = parseToolPayload(value);
      const detail = parsed?.error;
      const message = typeof detail === 'string'
        ? detail
        : detail?.message ?? parsed?.message ?? parsed?.text ?? 'tool returned an error';
      throw apiError(
        'mcp-tool-error',
        `${publicToolName(rawName)} failed: ${message}`,
        502,
      );
    }
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
