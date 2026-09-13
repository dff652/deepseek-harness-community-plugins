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
  'comm_sent',
  'comm_agent_details',
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
  'sent',
  'agent-details',
];

export const DEFAULT_DONE_BODY = 'done';
export const TERMINAL_TASK_TYPES = ['done', 'error', 'cancel'];
export const SENT_POLL_INTERVAL_MS = 4000;
export const SENT_POLL_MAX_DELAY_MS = 30000;
export const SENT_POLL_MAX_ATTEMPTS = 12;
export const SENT_HISTORY_LIMIT = 50;

const UNREAD_DELIVERY_STATUSES = new Set(['pending', 'claimed']);
const RAW_DELIVERY_STATUSES = new Set(['pending', 'claimed', 'acked', 'submitted', 'outbound']);
const SENT_DELIVERY_STATUSES = new Set([
  'submitted',
  'claimed',
  'acked',
  'processing',
  'completed',
  'failed',
]);

const DELIVERY_STATUS_LABELS = new Map([
  ['pending', '待领取'],
  ['claimed', '已领取'],
  ['acked', '已确认收悉'],
  ['submitted', '已提交'],
  ['processing', '处理中'],
  ['completed', '已完成'],
  ['failed', '投递失败'],
  ['outbound', '已提交，待核实'],
]);

const SENT_DELIVERY_STATUS_LABELS = new Map([
  ['pending', '待领取'],
  ['outbound', '已提交，待核实'],
  ['submitted', '已提交'],
  ['claimed', '已领取'],
  ['acked', '已确认收悉'],
  ['processing', '处理中'],
  ['completed', '已完成'],
  ['failed', '失败'],
]);

const TASK_OUTCOME_LABELS = new Map([
  ['unknown', '待核实'],
  ['acked', '已确认收悉'],
  ['done', '已完成'],
  ['error', '失败'],
  ['cancel', '已取消'],
  ['message', '消息'],
]);

const STATUS_TONES = new Map([
  ['submitted', 'neutral'],
  ['pending', 'neutral'],
  ['claimed', 'info'],
  ['processing', 'info'],
  ['completed', 'success'],
  ['done', 'success'],
  ['acked', 'success'],
  ['failed', 'danger'],
  ['error', 'danger'],
  ['unknown', 'warning'],
  ['outbound', 'warning'],
]);

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
    const deliveryStatus = item.delivery_status == null && item.status == null
      ? ''
      : String(item.delivery_status ?? item.status);
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
    to: String(item.to ?? ''),
    body: String(item.body_md ?? item.body ?? item.text ?? ''),
    effect: String(item.effect_level ?? item.effect ?? 'read'),
    // comm_tail in the current provider contract omits delivery status. An
    // empty value keeps the UI from inventing a pending/claimed state.
    deliveryStatus: item.delivery_status == null ? '' : String(item.delivery_status),
    requiresHumanApproval: item.requires_human_approval === true,
  }));
}

export function messageTypeLabel(type) {
  const value = String(type ?? 'message');
  if (value === 'task') return '任务';
  if (value === 'message') return '消息';
  if (value === 'done') return '完成';
  if (value === 'error') return '错误';
  if (value === 'cancel') return '取消';
  return value;
}

export function firstLine(value) {
  const line = String(value ?? '').split(/\r?\n/, 1)[0].trim();
  return line || '无主题';
}

export function threadSubject(item, messages = []) {
  const task = messages.find((message) => (
    message?.type === 'task' && String(message?.body ?? '').trim() !== ''
  ));
  const bodies = [task?.body, item?.body, ...messages
    .filter((message) => !TERMINAL_TASK_TYPES.includes(message?.type))
    .map((message) => message?.body)];
  const body = bodies.find((candidate) => String(candidate ?? '').trim() !== '');
  return firstLine(body);
}

export function threadParticipants(item, messages = []) {
  const values = [];
  const add = (value) => {
    const participant = String(value ?? '').trim();
    if (participant && !values.includes(participant)) values.push(participant);
  };
  add(item?.from);
  add(item?.to);
  for (const message of messages) {
    add(message?.from);
    add(message?.to);
  }
  return values;
}

export function deliveryStatusLabel(status) {
  const value = String(status ?? '').trim();
  return DELIVERY_STATUS_LABELS.get(value) ?? '状态未知';
}

export function sentDeliveryStatusLabel(status) {
  const value = String(status ?? '').trim();
  return SENT_DELIVERY_STATUS_LABELS.get(value) ?? '待核实';
}

export function statusTone(status) {
  return STATUS_TONES.get(String(status ?? '').trim()) ?? 'neutral';
}

export function statusBadgeStyle(tone) {
  const color = {
    neutral: 'var(--dsh-fg, CanvasText)',
    info: 'var(--dsh-info, #2563eb)',
    success: 'var(--dsh-success, #15803d)',
    danger: 'var(--dsh-danger, #b91c1c)',
    warning: 'var(--dsh-warning, #b45309)',
  }[tone] ?? 'var(--dsh-fg, CanvasText)';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.2,
    color,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
  };
}

export function statusGlyph(tone) {
  if (tone === 'success') return '✓';
  if (tone === 'danger') return '✕';
  if (tone === 'warning') return '!';
  if (tone === 'info') return '●';
  return '○';
}

export function mailRowStatus(item, folder = 'inbox') {
  const taskStatus = String(item?.taskStatus ?? '').trim().toLowerCase();
  if (folder === 'sent' && item?.type === 'task' && ['completed', 'failed'].includes(taskStatus)) {
    return {
      kind: taskStatus,
      label: taskStatus === 'completed' ? '已完成' : '失败',
      layer: 'task',
      tone: statusTone(taskStatus),
    };
  }
  const delivery = actualDeliveryStatus(item);
  const label = folder === 'sent' ? sentDeliveryStatusLabel(delivery) : deliveryStatusLabel(delivery);
  return {
    kind: delivery || 'unknown',
    label,
    layer: 'delivery',
    tone: statusTone(delivery || 'unknown'),
  };
}

export function actualDeliveryStatus(item) {
  // A successful send proves this local submission even before history can
  // supply a delivery receipt. Durable history still requires its raw field.
  if (item?.localOnly === true && item?.durable !== true
    && item.rawDeliveryStatus == null && item.deliveryStatus === 'submitted') return 'submitted';
  // Durable sender rows carry a separate raw field, including null when no
  // delivery is known. Never substitute the provider's derived task status.
  const value = item != null && Object.hasOwn(item, 'rawDeliveryStatus')
    ? item.rawDeliveryStatus
    : item?.deliveryStatus;
  const raw = String(value ?? '').trim().toLowerCase();
  return RAW_DELIVERY_STATUSES.has(raw) ? raw : 'unknown';
}

export function recipientCapabilitySummary(details) {
  if (!details || details.error === 'upgrade-required') {
    return '当前服务不支持收件人设备详情。';
  }
  const missing = [];
  if (!details.deviceName) missing.push('设备名称');
  if (!details.deviceIp) missing.push('设备地址');
  if (!details.connection || details.connection === 'unknown') missing.push('在线状态');
  if (missing.length === 0) return '';
  const evidence = details.evidence && typeof details.evidence === 'object' ? details.evidence : {};
  const unknownFields = Array.isArray(details.fieldsUnknown) ? details.fieldsUnknown : [];
  const names = missing.join('、');
  if (evidence.registration === false && evidence.heartbeat === false) {
    return `${names}当前未知；服务未提供身份登记或心跳证据。`;
  }
  if (unknownFields.length > 0) {
    return `${names}当前未知。`;
  }
  if (details.connection === 'unavailable') {
    return `${names}当前不可用。`;
  }
  return `${names}当前未知。`;
}

const PUBLIC_ERROR_MESSAGES = new Map([
  ['forbidden', '无权执行此操作。'],
  ['method-error', '请求方式不受支持。'],
  ['not-found', '找不到该操作。'],
  ['bad-request', '请求无效。'],
  ['mcp-unavailable', '邮箱服务未加载。'],
  ['mcp-tool-error', '邮箱操作失败。'],
  ['internal', '操作结果未知，请核实后再试。'],
  ['timeout', '操作超时，请核实结果后再试。'],
  ['network-error', '连接中断，操作结果未知，请核实后再试。'],
  ['unconfigured', '尚未配置该项。'],
]);

export function publicErrorMessage(error) {
  const code = error && typeof error === 'object'
    ? String(error.code ?? error.error?.code ?? '').trim()
    : '';
  return PUBLIC_ERROR_MESSAGES.get(code) ?? PUBLIC_ERROR_MESSAGES.get('internal');
}

export async function requestMailApi(method, payload = {}, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(publicErrorMessage({ code: 'timeout' })), { code: 'timeout' }));
      controller.abort();
    }, 65000);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let response;
      try {
        response = await fetchImpl(`${API_PREFIX}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch {
        throw Object.assign(new Error(publicErrorMessage({ code: 'network-error' })), { code: 'network-error' });
      }
      const parsed = await response.json().catch(() => null);
      if (!response.ok || parsed?.ok !== true) {
        const code = PUBLIC_ERROR_MESSAGES.has(parsed?.error?.code) ? parsed.error.code : 'internal';
        throw Object.assign(new Error(publicErrorMessage({ code })), { code, status: response.status });
      }
      return parsed.value;
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizePublicError(value) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '操作失败，请重试。';
  const home = `h${'ome'}`;
  text = text.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s\/]*:[^\s\/]*@/gi, (match) => {
    const scheme = match.split(':')[0];
    return `${scheme}://[redacted]@`;
  });
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{4,}/gi, '[redacted]');
  text = text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted]');
  text = text.replace(new RegExp(String.raw`(?:\/(?:${home}|Users|root|etc|var|opt|tmp|usr|mnt|srv|data)|[A-Za-z]:\\)[^\s"'\`]+`, 'g'), '[path]');
  text = text.replace(/(?:^|[\s"'`])(\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+)/g, ' [path]');
  text = text.replace(/\bat\s+\S+(?:\s+\([^)]+\))?/g, '');
  if (/(?:api[_-]?key|access[_-]?token|\btoken\b|password|secret|authorization|passwd)["']?\s*[:=]\s*\S+/i.test(text)) {
    return '操作失败。详细信息已隐藏。';
  }
  if (/:[^\/\s]+@/.test(text) || /-----BEGIN /.test(text)) {
    return '操作失败。详细信息已隐藏。';
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 280) return `${text.slice(0, 277)}…`;
  return text || '操作失败，请重试。';
}

export function sentDeliveryStatus(status) {
  const value = String(status ?? '').trim().toLowerCase();
  return SENT_DELIVERY_STATUSES.has(value) ? value : 'unknown';
}

let localSentSequence = 0;

export function sentRecord(result, payload, from) {
  const value = result != null && typeof result === 'object' ? result : {};
  const providerStatus = value.status ?? value.delivery_status ?? 'submitted';
  const normalizedStatus = sentDeliveryStatus(providerStatus);
  return {
    localKey: `sent-${Date.now()}-${++localSentSequence}`,
    messageId: String(value.id ?? value.message_id ?? ''),
    threadId: String(value.thread_id ?? payload.thread_id ?? ''),
    taskId: String(value.task_id ?? payload.task_id ?? ''),
    type: String(value.type ?? payload.type ?? 'message'),
    from: String(value.from ?? from ?? ''),
    to: String(value.to ?? payload.to ?? ''),
    body: String(value.body_md ?? value.body ?? payload.body ?? ''),
    effect: String(value.effect_level ?? value.effect ?? payload.effect ?? 'read'),
    sentAt: value.sent_at ?? value.ts ?? null,
    deliveryStatus: normalizedStatus === 'unknown' ? 'submitted' : normalizedStatus,
    rawDeliveryStatus: value.delivery_status == null ? null : String(value.delivery_status),
    taskStatus: value.task_status == null ? '' : String(value.task_status),
    statusEvidence: value.status_evidence ?? null,
    unread: false,
    durable: false,
    claimed: false,
    localOnly: true,
  };
}

export function isPendingSentItem(item) {
  return item?.durable === true || item?.localOnly === true
    ? ['submitted', 'claimed', 'processing'].includes(String(item?.deliveryStatus ?? '').trim().toLowerCase())
    : false;
}

export function nextSentPollDelay(delay, succeeded = false) {
  if (succeeded) return SENT_POLL_INTERVAL_MS;
  const current = Number.isFinite(delay) ? delay : SENT_POLL_INTERVAL_MS;
  return Math.min(
    SENT_POLL_MAX_DELAY_MS,
    Math.max(SENT_POLL_INTERVAL_MS, Math.round(current * 2)),
  );
}

/**
 * Normalize the provider-owned sender history. The provider must identify the
 * authenticated sender; a list without that owner is never shown as durable.
 * `status` is the provider's derived sender status. `delivery_status` is kept
 * separately as the raw mailbox field because it can describe an earlier
 * delivery event. Rows carrying a conflicting sender are dropped as an
 * isolation guard.
 */
export function sentItems(payload, expectedAgentId = '') {
  const owner = String(payload?.agent_id ?? payload?.sender_id ?? '').trim();
  const expected = String(expectedAgentId ?? '').trim();
  if (!owner || isUnknownIdentity(owner)) return { agentId: '', items: [], error: 'missing-sender-identity' };
  if (expected && owner !== expected) {
    return { agentId: owner, items: [], error: 'sender-identity-mismatch' };
  }
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const items = rows.map((item) => {
    const rowSender = String(item?.from_id ?? item?.from ?? item?.sender ?? '').trim();
    const recipient = item?.recipient != null && typeof item.recipient === 'object'
      ? item.recipient
      : null;
    const recipientId = recipient?.agent_id ?? recipient?.id ?? item?.to ?? '';
    const rawDeliveryStatus = item?.delivery_status ?? item?.deliveryStatus ?? null;
    const status = item?.status == null ? rawDeliveryStatus : item.status;
    const normalizedStatus = sentDeliveryStatus(status);
    return {
      messageId: String(item?.message_id ?? item?.id ?? ''),
      threadId: item?.thread_id == null ? '' : String(item.thread_id),
      taskId: item?.task_id == null ? '' : String(item.task_id),
      type: String(item?.type ?? 'message'),
      from: owner,
      to: String(recipientId ?? ''),
      body: String(item?.body_md ?? item?.body ?? item?.text ?? ''),
      effect: String(item?.effect_level ?? item?.effect ?? 'read'),
      sentAt: item?.sent_at ?? item?.ts ?? item?.created_at ?? null,
      deliveryStatus: normalizedStatus,
      rawDeliveryStatus: rawDeliveryStatus == null ? null : String(rawDeliveryStatus),
      taskStatus: item?.task_status == null ? '' : String(item.task_status),
      statusEvidence: item?.status_evidence ?? null,
      recipient,
      durable: true,
      localOnly: false,
      unread: false,
      claimed: ['claimed', 'acked', 'processing', 'completed', 'failed'].includes(
        normalizedStatus,
      ),
      senderConflict: rowSender !== '' && rowSender !== owner,
    };
  }).filter((item) => item.messageId !== '' && !item.senderConflict)
    .map(({ senderConflict, ...item }) => item);
  return {
    agentId: owner,
    count: Number.isFinite(Number(payload?.count)) ? Number(payload.count) : items.length,
    items,
    error: '',
  };
}

export function mergeSentRecords(remoteItems = [], localItems = []) {
  const durable = Array.isArray(remoteItems) ? remoteItems : [];
  const local = Array.isArray(localItems) ? localItems : [];
  const durableIds = new Set(durable.map((item) => item?.messageId).filter(Boolean));
  return [
    ...durable,
    ...local.filter((item) => item?.messageId && !durableIds.has(item.messageId)),
  ];
}

/**
 * Normalize the provider-owned recipient details without deriving presence
 * from directory membership or from a device/network field.
 */
export function recipientDetails(payload, expectedAgentId = '') {
  const value = payload?.agent != null && typeof payload.agent === 'object'
    ? payload.agent
    : payload?.details != null && typeof payload.details === 'object'
      ? payload.details
      : payload;
  const agentId = String(value?.agent_id ?? value?.id ?? payload?.agent_id ?? '').trim();
  const expected = String(expectedAgentId ?? '').trim();
  if (!agentId || isUnknownIdentity(agentId)) return { agentId: '', error: 'missing-agent-identity' };
  if (expected && expected !== agentId) {
    return { agentId, error: 'agent-identity-mismatch' };
  }
  const rawConnection = String(value?.connection ?? '').trim().toLowerCase();
  const connection = ['connected', 'disconnected', 'unknown'].includes(rawConnection)
    ? rawConnection
    : 'unknown';
  const evidence = value?.evidence != null && typeof value.evidence === 'object'
    ? {
      registration: typeof value.evidence.registration === 'boolean' ? value.evidence.registration : null,
      heartbeat: typeof value.evidence.heartbeat === 'boolean' ? value.evidence.heartbeat : null,
    }
    : { registration: null, heartbeat: null };
  return {
    agentId,
    deviceName: value?.device_name == null ? null : String(value.device_name),
    deviceIp: value?.device_ip == null ? null : String(value.device_ip),
    hubEndpoint: value?.hub_endpoint == null ? null : String(value.hub_endpoint),
    connection,
    lastSeen: value?.last_seen == null || value.last_seen === '' ? null : String(value.last_seen),
    evidence,
    fieldsUnknown: Array.isArray(value?.fields_unknown) ? value.fields_unknown.map(String) : [],
    error: '',
  };
}

function isUnknownIdentity(value) {
  return ['unknown', 'unavailable', 'undefined', 'null', 'n/a'].includes(String(value).toLowerCase());
}

export function taskOutcome(item, messages = [], terminalTaskIds = new Set()) {
  if (!item || item.type !== 'task') return 'message';
  const terminal = messages.find((message) => (
    TERMINAL_TASK_TYPES.includes(message?.type)
    && Boolean(item.taskId)
    && message.taskId === item.taskId
  ));
  if (terminal) return terminal.type;
  if (item.taskId && terminalTaskIds?.has?.(item.taskId)) return 'done';
  if (item.deliveryStatus === 'acked') return 'acked';
  return 'unknown';
}

export function taskOutcomeLabel(outcome) {
  return TASK_OUTCOME_LABELS.get(String(outcome ?? '')) ?? '状态未知';
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
  const agentId = payload?.remote === true ? payload?.agent_id : payload?.agent_id_env;
  return {
    ok: warnings.length === 0 && payload?.home_exists !== false,
    agentId: agentId == null ? '' : String(agentId),
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
  const values = Array.isArray(payload?.agents)
    ? payload.agents
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];
  return values.map((value) => {
    if (value != null && typeof value === 'object') {
      return String(value.agent_id ?? value.id ?? '');
    }
    return String(value ?? '');
  }).filter(Boolean);
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
