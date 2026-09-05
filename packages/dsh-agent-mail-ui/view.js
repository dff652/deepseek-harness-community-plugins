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

export function inboxItems(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item) => ({
    messageId: String(item.message_id ?? item.id ?? ''),
    threadId: item.thread_id == null ? '' : String(item.thread_id),
    taskId: item.task_id == null ? '' : String(item.task_id),
    type: String(item.type ?? 'message'),
    from: String(item.from ?? item.sender ?? ''),
    to: String(item.to ?? ''),
    body: String(item.body_md ?? item.body ?? item.text ?? ''),
    effect: String(item.effect_level ?? item.effect ?? 'read'),
    deliveryStatus: String(item.delivery_status ?? item.status ?? 'pending'),
    unread: item.unread !== false,
    claimed: item.delivery_status === 'claimed' || item.status === 'claimed' || item.claimed === true,
    requiresHumanApproval: item.requires_human_approval === true,
  })).filter((item) => item.messageId !== '');
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
