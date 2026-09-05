export const SERVER_NAME = 'agent-mail';
export const TAB_ID = 'dsh-agent-mail:inbox';
export const API_PREFIX = '/agent-mail-ui/api';

export const PROXY_TOOLS = [
  'comm_diagnose',
  'comm_list_agents',
  'comm_inbox',
  'comm_claim',
  'comm_ack',
  'comm_tail',
  'comm_send',
  'comm_approvals',
];

export const HUMAN_ONLY_TOOLS = ['comm_approve', 'comm_reject'];

export const API_METHODS = [
  'status',
  'diagnose',
  'agents',
  'inbox',
  'claim',
  'ack',
  'tail',
  'send',
  'approvals',
];

export const DEFAULT_DONE_BODY = 'done';
export const TERMINAL_TASK_TYPES = ['done', 'error', 'cancel'];

const UNREAD_DELIVERY_STATUSES = new Set(['pending', 'claimed']);

export function publicToolName(rawName) {
  return `mcp__${SERVER_NAME}__${rawName}`;
}

export function isProxyTool(rawName) {
  return PROXY_TOOLS.includes(rawName);
}

export function isHumanOnlyTool(rawName) {
  return HUMAN_ONLY_TOOLS.includes(rawName);
}

export function parseToolPayload(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { text: value };
    }
  }
  if (typeof value !== 'object') return { value };
  if (value.structuredContent != null && typeof value.structuredContent === 'object') {
    return value.structuredContent;
  }
  if (Array.isArray(value.content)) {
    const text = value.content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }
  return value;
}

/**
 * Select the current DSH session from the rc.2 sessions.list snapshot.
 * `current` may address a breadcrumb-only child that is absent from `ids`,
 * but every usable current id is still present in `byId`.
 */
export function currentSessionId(snapshot) {
  const current = snapshot?.current;
  if (typeof current !== 'string' || current === '') return undefined;
  if (snapshot?.byId == null || typeof snapshot.byId !== 'object') return undefined;
  return Object.prototype.hasOwnProperty.call(snapshot.byId, current)
    && snapshot.byId[current] != null
    ? current
    : undefined;
}

export function sessionScope(snapshot) {
  const sessionId = currentSessionId(snapshot);
  return sessionId ? { sessionId } : {};
}

export function inboxItems(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item) => {
    const deliveryStatus = String(item.delivery_status ?? item.status ?? 'pending');
    return {
      messageId: String(item.message_id ?? item.id ?? ''),
      threadId: item.thread_id == null ? '' : String(item.thread_id),
      taskId: item.task_id == null ? '' : String(item.task_id),
      type: String(item.type ?? 'message'),
      from: String(item.from ?? item.sender ?? ''),
      to: String(item.to ?? ''),
      body: String(item.body_md ?? item.body ?? item.text ?? ''),
      effect: String(item.effect_level ?? item.effect ?? 'read'),
      deliveryStatus,
      unread: UNREAD_DELIVERY_STATUSES.has(deliveryStatus),
      claimed: deliveryStatus === 'claimed',
      requiresHumanApproval: item.requires_human_approval === true,
    };
  }).filter((item) => item.messageId !== '');
}

export function threadMessages(payload) {
  const rows = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.messages)
      ? payload.messages
      : Array.isArray(payload)
        ? payload
        : [];
  return rows.map((item) => ({
    messageId: String(item.message_id ?? item.id ?? ''),
    threadId: item.thread_id == null ? '' : String(item.thread_id),
    taskId: item.task_id == null ? '' : String(item.task_id),
    type: String(item.type ?? 'message'),
    from: String(item.from ?? item.sender ?? ''),
    body: String(item.body_md ?? item.body ?? item.text ?? ''),
    effect: String(item.effect_level ?? item.effect ?? 'read'),
    requiresHumanApproval: item.requires_human_approval === true,
  }));
}

export function hasTerminalTaskOutcome(item, messages = []) {
  if (!item || item.type !== 'task') return true;
  return messages.some((message) => (
    TERMINAL_TASK_TYPES.includes(message?.type)
    && Boolean(item.taskId)
    && message.taskId === item.taskId
  ));
}

export function canAck(item, messages = []) {
  if (!item?.messageId) return false;
  return hasTerminalTaskOutcome(item, messages);
}

export function diagnoseSummary(payload) {
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const agents = Array.isArray(payload?.agents) ? payload.agents.map(String) : [];
  return {
    ok: warnings.length === 0 && payload?.home_exists !== false,
    agentId: payload?.agent_id_env == null ? '' : String(payload.agent_id_env),
    version: payload?.version == null ? '' : String(payload.version),
    implementation: payload?.implementation == null ? '' : String(payload.implementation),
    agents,
    warnings: warnings.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))),
    messageCount: Number(payload?.database?.counts?.messages ?? 0),
  };
}

export function quoteComposerText(item) {
  const parts = ['Please handle this Agent Mail item.'];
  if (item.messageId) parts.push(`message_id=${item.messageId}`);
  if (item.threadId) parts.push(`thread_id=${item.threadId}`);
  if (item.taskId) parts.push(`task_id=${item.taskId}`);
  return parts.join(' ');
}

export function unreadBadge(items) {
  const count = items.filter((item) => item.unread).length;
  return count > 0 ? count : null;
}

export function agentList(payload) {
  if (Array.isArray(payload?.agents)) return payload.agents.map(String);
  if (Array.isArray(payload)) return payload.map(String);
  return [];
}

export function validateSendPayload(payload) {
  const to = String(payload?.to ?? '').trim();
  const body = String(payload?.body ?? '').trim();
  const type = String(payload?.type ?? 'task').trim() || 'task';
  const effect = String(payload?.effect ?? 'read').trim() || 'read';
  if (!to) return { error: 'to is required' };
  if (!body) return { error: 'body is required' };
  if (effect === 'write' && payload?.confirmWrite !== true) {
    return { error: 'write effect requires confirmWrite' };
  }
  const args = { to, type, body, effect };
  if (payload?.thread_id) args.thread_id = String(payload.thread_id);
  if (payload?.task_id) args.task_id = String(payload.task_id);
  return { args };
}

export function toolCardKind(toolName) {
  if (toolName === publicToolName('comm_inbox')) return 'inbox';
  if (toolName === publicToolName('comm_send')) return 'send';
  if (toolName === publicToolName('comm_approvals')) return 'approvals';
  if (toolName === publicToolName('comm_diagnose')) return 'diagnose';
  return 'generic';
}

function isToolResultBlock(block) {
  return block != null && typeof block === 'object' && block.kind === 'tool-result';
}

/**
 * Match DSH rc.2's resultText rule for a settled ToolResultNode: text content
 * is kept verbatim and non-text content is displayed as pretty JSON. The
 * error footer comes from the result node when a failed call has no content.
 */
export function toolResultText(block) {
  if (!isToolResultBlock(block) || !Array.isArray(block.content)) return '';
  const parts = [];
  for (const content of block.content) {
    if (content?.type === 'text' && typeof content.text === 'string') {
      parts.push(content.text);
    } else if (content != null && typeof content === 'object') {
      parts.push(JSON.stringify(content, null, 2));
    }
  }
  if (parts.length === 0 && block.error != null && typeof block.error === 'object') {
    const name = typeof block.error.name === 'string' ? block.error.name : '';
    const code = typeof block.error.code === 'string' ? block.error.code : '';
    if (name || code) parts.push([name, code].filter(Boolean).join(': '));
  }
  return parts.join('\n');
}

/**
 * Derive the UI state and payload from the actual tool-call owner block.
 * RunningToolCall has no `kind`; ToolResultNode has `kind: 'tool-result'` and
 * carries serialized MCP output in `content`.
 */
export function toolCardModel(toolName, block) {
  const settled = isToolResultBlock(block);
  const text = settled ? toolResultText(block) : '';
  const state = !settled
    ? 'running'
    : block.error?.code === 'interrupted'
      ? 'stopped'
      : block.isError === true
        ? 'error'
        : 'ok';
  return {
    kind: toolCardKind(toolName),
    state,
    callId: String(block?.callId ?? ''),
    payload: settled && text !== '' ? parseToolPayload(text) : {},
    text,
  };
}
