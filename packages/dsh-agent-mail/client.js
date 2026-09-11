window.__ModuleLoader__.load({
	id: '@dff652/dsh-agent-mail',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const { createElement: h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = require('react');
		const { createRoot } = require('react-dom/client');
		const SERVER_NAME = 'agent-mail';
		const TAB_ID = 'dsh-agent-mail:inbox';
		const API_PREFIX = '/agent-mail-ui/api';

		const PROXY_TOOLS = [
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

		const HUMAN_ONLY_TOOLS = ['comm_approve', 'comm_reject'];

		const API_METHODS = [
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

		const DEFAULT_DONE_BODY = 'done';
		const TERMINAL_TASK_TYPES = ['done', 'error', 'cancel'];
		const SENT_POLL_INTERVAL_MS = 4000;
		const SENT_POLL_MAX_DELAY_MS = 30000;
		const SENT_POLL_MAX_ATTEMPTS = 12;
		const SENT_HISTORY_LIMIT = 50;

		const UNREAD_DELIVERY_STATUSES = new Set(['pending', 'claimed']);
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
		  ['claimed', '已领取（未确认收悉）'],
		  ['acked', '已确认收悉'],
		  ['submitted', '已提交到邮箱'],
		  ['processing', '处理中'],
		  ['completed', '已完成'],
		  ['failed', '提交或投递失败'],
		  ['outbound', '已提交到邮箱 · 签收状态未知'],
		]);

		const SENT_DELIVERY_STATUS_LABELS = new Map([
		  ['submitted', '已提交'],
		  ['claimed', '已领取'],
		  ['acked', '已确认收悉'],
		  ['processing', '处理中'],
		  ['completed', '已完成'],
		  ['failed', '失败'],
		]);

		const TASK_OUTCOME_LABELS = new Map([
		  ['unknown', '完成状态未知（待核实）'],
		  ['acked', '已结束（已签收）'],
		  ['done', '已完成'],
		  ['error', '执行失败'],
		  ['cancel', '已取消'],
		  ['message', '消息'],
		]);

		function publicToolName(rawName) {
		  return `mcp__${SERVER_NAME}__${rawName}`;
		}

		function isProxyTool(rawName) {
		  return PROXY_TOOLS.includes(rawName);
		}

		function isHumanOnlyTool(rawName) {
		  return HUMAN_ONLY_TOOLS.includes(rawName);
		}

		function parseToolPayload(value) {
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
		function currentSessionId(snapshot) {
		  const current = snapshot?.current;
		  if (typeof current !== 'string' || current === '') return undefined;
		  if (snapshot?.byId == null || typeof snapshot.byId !== 'object') return undefined;
		  return Object.prototype.hasOwnProperty.call(snapshot.byId, current)
		    && snapshot.byId[current] != null
		    ? current
		    : undefined;
		}

		function sessionScope(snapshot) {
		  const sessionId = currentSessionId(snapshot);
		  return sessionId ? { sessionId } : {};
		}

		function inboxItems(payload) {
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

		function threadMessages(payload) {
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

		function messageTypeLabel(type) {
		  const value = String(type ?? 'message');
		  if (value === 'task') return '任务';
		  if (value === 'message') return '消息';
		  if (value === 'done') return '完成';
		  if (value === 'error') return '错误';
		  if (value === 'cancel') return '取消';
		  return value;
		}

		function firstLine(value) {
		  const line = String(value ?? '').split(/\r?\n/, 1)[0].trim();
		  return line || '无主题';
		}

		function threadSubject(item, messages = []) {
		  const task = messages.find((message) => (
		    message?.type === 'task' && String(message?.body ?? '').trim() !== ''
		  ));
		  const bodies = [task?.body, item?.body, ...messages
		    .filter((message) => !TERMINAL_TASK_TYPES.includes(message?.type))
		    .map((message) => message?.body)];
		  const body = bodies.find((candidate) => String(candidate ?? '').trim() !== '');
		  return firstLine(body);
		}

		function threadParticipants(item, messages = []) {
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

		function deliveryStatusLabel(status) {
		  const value = String(status ?? '').trim();
		  return DELIVERY_STATUS_LABELS.get(value) ?? '状态未知';
		}

		function sentDeliveryStatusLabel(status) {
		  const value = String(status ?? '').trim();
		  return SENT_DELIVERY_STATUS_LABELS.get(value) ?? '状态未知';
		}

		function sentDeliveryStatus(status) {
		  const value = String(status ?? '').trim().toLowerCase();
		  return SENT_DELIVERY_STATUSES.has(value) ? value : 'unknown';
		}

		function isPendingSentItem(item) {
		  return item?.durable === true || item?.localOnly === true
		    ? ['submitted', 'claimed', 'processing'].includes(String(item?.deliveryStatus ?? '').trim().toLowerCase())
		    : false;
		}

		function nextSentPollDelay(delay, succeeded = false) {
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
		function sentItems(payload, expectedAgentId = '') {
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

		function mergeSentRecords(remoteItems = [], localItems = []) {
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
		function recipientDetails(payload, expectedAgentId = '') {
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
		      registration: value.evidence.registration === true,
		      heartbeat: value.evidence.heartbeat === true,
		    }
		    : { registration: false, heartbeat: false };
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

		function taskOutcome(item, messages = [], terminalTaskIds = new Set()) {
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

		function taskOutcomeLabel(outcome) {
		  return TASK_OUTCOME_LABELS.get(String(outcome ?? '')) ?? '状态未知';
		}

		function hasTerminalTaskOutcome(item, messages = []) {
		  if (!item || item.type !== 'task') return true;
		  return messages.some((message) => (
		    TERMINAL_TASK_TYPES.includes(message?.type)
		    && Boolean(item.taskId)
		    && message.taskId === item.taskId
		  ));
		}

		function canAck(item, messages = []) {
		  if (!item?.messageId) return false;
		  return hasTerminalTaskOutcome(item, messages);
		}

		function diagnoseSummary(payload) {
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

		function quoteComposerText(item) {
		  const parts = ['Please handle this Agent Mail item.'];
		  if (item.messageId) parts.push(`message_id=${item.messageId}`);
		  if (item.threadId) parts.push(`thread_id=${item.threadId}`);
		  if (item.taskId) parts.push(`task_id=${item.taskId}`);
		  return parts.join(' ');
		}

		function unreadBadge(items) {
		  const count = items.filter((item) => item.unread).length;
		  return count > 0 ? count : null;
		}

		function agentList(payload) {
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

		function validateSendPayload(payload) {
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

		function toolCardKind(toolName) {
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
		function toolResultText(block) {
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
		function toolCardModel(toolName, block) {
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
		/**
		 * Browser-side adapter for the authenticated Agent Mail management host.
		 *
		 * This module deliberately keeps the management session and enrollment wire
		 * separate from the ordinary MCP mailbox proxy. The only browser-persisted
		 * values are opaque recovery handles and the original compare-and-swap
		 * revision; credentials, pairing codes and CSRF tokens stay in memory.
		 */

		const MANAGEMENT_SESSION_PATH = '/v1/management-session';
		const CONNECTION_MANAGEMENT_PATH = '/v1/connection-management';
		const CSRF_HEADER = 'X-Agent-Mail-CSRF';
		const RECOVERY_STORAGE_KEY = 'dsh-agent-mail-ui.enrollment.v1';

		const RECOVERY_FIELDS = [
		  'profile_handle',
		  'context_handle',
		  'enrollment_handle',
		  'request_id',
		  'observed_config_revision',
		];

		const ENROLLMENT_STATES = new Set([
		  'context_ready',
		  'redeem_in_progress',
		  'pending_save',
		  'commit_in_progress',
		  'saved',
		  'active',
		  'error',
		  'cleanup_pending',
		  'cleanup_conflict',
		  'cancelled',
		  'expired',
		]);

		const PENDING_PHASES = new Set([
		  'beginning',
		  'context_ready',
		  'redeeming',
		  'recovering',
		  'pending_save',
		  'committing',
		  'cancelling',
		  'unknown',
		  'cleanup_pending',
		  'cleanup_conflict',
		]);

		const SAFE_ERROR_MESSAGES = new Map([
		  ['management_denied', '管理会话无权执行此操作。请重新登录或联系管理宿主。'],
		  ['target_not_allowed', '所选 DSH profile 或 Hub 不在管理宿主允许范围内。'],
		  ['tls_untrusted', 'Hub TLS 信任校验失败。请检查管理宿主的信任配置。'],
		  ['hub_unreachable', 'Hub 暂时无法访问，请检查网络后重试。'],
		  ['code_invalid_or_expired', '配对码无效或已过期。请在 Hub 上重新生成配对码。'],
		  ['rate_limited', 'Hub 暂时限制了配对请求，请稍后重试。'],
		  ['identity_conflict', '该身份已经存在，当前向导不会覆盖已有身份。'],
		  ['identity_mismatch', 'Hub 返回的身份与确认身份不一致。'],
		  ['context_expired', '配对上下文已过期，请取消后重新开始。'],
		  ['idempotency_conflict', '重试参数与原操作不一致，请刷新当前状态。'],
		  ['config_conflict', 'profile 配置已发生变化，请刷新状态后再决定。'],
		  ['save_failed', '连接已验证，但保存失败；请刷新状态后重试保存。'],
		  ['activation_failed', '连接已保存，但 DSH 激活检查未通过。确认已重启后可再次检查。'],
		  ['cleanup_pending', '取消仍在清理中，尚未确认完成。请等待后刷新状态。'],
		  ['cleanup_conflict', '取消遇到配置冲突，未报告为成功；请刷新状态并由管理者处理。'],
		  ['directory_failed', '收件人目录读取失败，请稍后刷新。'],
		  ['test_timeout', '测试任务仍未得到可验证结果；这不代表收件人离线。'],
		  ['csrf_missing', '管理会话已失效，请重新登录。'],
		  ['management_unavailable', '管理宿主未配置。'],
		  ['network_error', '管理宿主暂时不可达，请检查连接后重试。'],
		  ['protocol_error', '管理宿主返回了无法识别的结果。'],
		]);

		function safeText(value) {
		  return typeof value === 'string' ? value : '';
		}

		function messageFor(code, fallback = '操作失败，请检查管理宿主状态。') {
		  return SAFE_ERROR_MESSAGES.get(code) ?? fallback;
		}

		function isValidString(value) {
		  return typeof value === 'string' && value.trim() !== '';
		}

		function randomRequestId() {
		  const crypto = globalThis.crypto;
		  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
		  if (typeof crypto?.getRandomValues === 'function') {
		    const bytes = new Uint8Array(16);
		    crypto.getRandomValues(bytes);
		    bytes[6] = (bytes[6] & 0x0f) | 0x40;
		    bytes[8] = (bytes[8] & 0x3f) | 0x80;
		    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
		    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		  }
		  throw new Error('secure random source unavailable');
		}

		function readRecovery(storage) {
		  if (storage == null || typeof storage.getItem !== 'function') return null;
		  let raw;
		  try {
		    raw = storage.getItem(RECOVERY_STORAGE_KEY);
		  } catch {
		    return null;
		  }
		  if (!raw) return null;
		  try {
		    const parsed = JSON.parse(raw);
		    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		    const result = {};
		    for (const field of RECOVERY_FIELDS) {
		      if (Object.hasOwn(parsed, field)) {
		        if (!isValidString(parsed[field]) || parsed[field].length > 512) return null;
		        result[field] = parsed[field];
		      }
		    }
		    if (!result.profile_handle || (!result.context_handle && !result.enrollment_handle)) return null;
		    return result;
		  } catch {
		    return null;
		  }
		}

		function writeRecovery(storage, record) {
		  if (storage == null || typeof storage.setItem !== 'function') return;
		  const value = {};
		  for (const field of RECOVERY_FIELDS) {
		    if (isValidString(record?.[field])) value[field] = record[field];
		  }
		  if (!value.profile_handle || (!value.context_handle && !value.enrollment_handle)) {
		    clearRecovery(storage);
		    return;
		  }
		  try {
		    storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(value));
		  } catch {
		    // Private browsing and quota policies may reject session storage. The
		    // in-memory controller remains usable; no sensitive fallback is created.
		  }
		}

		function clearRecovery(storage) {
		  if (storage == null || typeof storage.removeItem !== 'function') return;
		  try { storage.removeItem(RECOVERY_STORAGE_KEY); } catch { /* unavailable */ }
		}

		function browserSessionStorage() {
		  try { return globalThis.sessionStorage; } catch { return undefined; }
		}

		function normalizeProfile(profile) {
		  if (profile == null || typeof profile !== 'object' || Array.isArray(profile)) return null;
		  const handle = safeText(profile.handle).trim();
		  const label = safeText(profile.label).trim();
		  const endpoints = Array.isArray(profile.endpoints)
		    ? profile.endpoints.filter((endpoint) => isValidString(endpoint)).map((endpoint) => endpoint.trim())
		    : [];
		  if (!handle || !label) return null;
		  return { handle, label, endpoints: [...new Set(endpoints)] };
		}

		function normalizeSession(value) {
		  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
		    throw new ManagementClientError('protocol_error');
		  }
		  if (value.authenticated !== true || !isValidString(value.csrf_token) || !isValidString(value.expires_at)) {
		    throw new ManagementClientError('protocol_error');
		  }
		  const profiles = Array.isArray(value.profiles)
		    ? value.profiles.map(normalizeProfile).filter(Boolean)
		    : null;
		  if (profiles == null) throw new ManagementClientError('protocol_error');
		  return {
		    csrfToken: value.csrf_token,
		    expiresAt: value.expires_at,
		    profiles,
		  };
		}

		function normalizeUnauthenticated(value) {
		  return value != null
		    && typeof value === 'object'
		    && !Array.isArray(value)
		    && value.authenticated === false;
		}

		function normalizeEnrollment(value) {
		  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
		    throw new ManagementClientError('protocol_error');
		  }
		  const state = safeText(value.state).trim();
		  if (!ENROLLMENT_STATES.has(state)) throw new ManagementClientError('protocol_error');
		  const result = { state };
		  for (const field of [
		    'enrollment_handle',
		    'agent_id',
		    'expires_at',
		    'verified_at',
		    'config_revision',
		    'remote_committed_at',
		    'saved_at',
		    'activated_at',
		    'save_state',
		    'activation_state',
		    'cleanup_state',
		    'commit_id',
		  ]) {
		    if (isValidString(value[field])) result[field] = value[field].trim();
		  }
		  if (value.retryable_error != null && typeof value.retryable_error === 'object') {
		    result.retryable_error = {
		      code: safeText(value.retryable_error.code),
		      stage: safeText(value.retryable_error.stage),
		      retryable: value.retryable_error.retryable === true,
		    };
		  }
		  return result;
		}

		function isEnrollmentPending(enrollment) {
		  return Boolean(enrollment && PENDING_PHASES.has(enrollment.phase));
		}

		function enrollmentPhaseLabel(enrollment) {
		  const phase = safeText(enrollment?.phase);
		  return new Map([
		    ['beginning', '正在创建安全配对上下文'],
		    ['context_ready', '等待输入 Hub 配对码'],
		    ['redeeming', '正在验证配对码'],
		    ['recovering', '正在恢复上一次结果'],
		    ['pending_save', '已验证，等待确认身份并保存'],
		    ['committing', '正在保存连接'],
		    ['saved', '已保存，等待激活检查'],
		    ['activating', '正在检查 DSH 激活'],
		    ['active', '连接已激活'],
		    ['cancelling', '正在取消并等待清理'],
		    ['cleanup_pending', '取消清理仍在进行'],
		    ['cleanup_conflict', '取消遇到冲突'],
		    ['unknown', '结果未知，等待状态核对'],
		    ['error', '操作失败'],
		    ['cancelled', '已取消'],
		    ['expired', '已过期'],
		  ]).get(phase) ?? '未开始';
		}

		function managementErrorMessage(error) {
		  if (error == null) return '';
		  return messageFor(safeText(error.code), safeText(error.message) || undefined);
		}

		class ManagementClientError extends Error {
		  constructor(code, options = {}) {
		    super(messageFor(code, options.message));
		    this.name = 'ManagementClientError';
		    this.code = code;
		    this.status = options.status ?? 0;
		    this.unknown = options.unknown === true;
		  }
		}

		class ManagementController {
		  constructor(options = {}) {
		    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
		    this.sessionPath = options.sessionPath ?? MANAGEMENT_SESSION_PATH;
		    this.enrollmentPath = options.enrollmentPath ?? CONNECTION_MANAGEMENT_PATH;
		    this.storage = options.storage === undefined ? browserSessionStorage() : options.storage;
		    this.listeners = new Set();
		    this.csrfToken = '';
		    this.disposed = false;
		    this.authEpoch = 0;
		    this.enrollmentGeneration = 0;
		    this.authPromise = null;
		    this.enrollmentPromise = null;
		    this.authBusy = false;
		    this.enrollmentBusy = false;
		    this.recovery = readRecovery(this.storage);
		    this.snapshot = {
		      managementStatus: 'checking',
		      authenticated: false,
		      profiles: [],
		      expiresAt: null,
		      selectedProfileHandle: this.recovery?.profile_handle ?? '',
		      selectedEndpoint: '',
		      authBusy: false,
		      enrollmentBusy: false,
		      enrollment: null,
		      error: '',
		      notice: '',
		    };
		  }

		  subscribe(listener) {
		    this.listeners.add(listener);
		    return () => this.listeners.delete(listener);
		  }

		  getSnapshot() {
		    return this.snapshot;
		  }

		  _set(patch) {
		    if (this.disposed) return;
		    this.snapshot = { ...this.snapshot, ...patch };
		    for (const listener of this.listeners) {
		      try { listener(); } catch { /* React owns subscription failures */ }
		    }
		  }

		  _setAuthBusy(value) {
		    this.authBusy = value;
		    this._set({ authBusy: value });
		  }

		  _setEnrollmentBusy(value) {
		    this.enrollmentBusy = value;
		    this._set({ enrollmentBusy: value });
		  }

		  _profile(handle = this.snapshot.selectedProfileHandle) {
		    return this.snapshot.profiles.find((profile) => profile.handle === handle);
		  }

		  _currentEnrollment(generation) {
		    const enrollment = this.snapshot.enrollment;
		    return enrollment && enrollment.generation === generation ? enrollment : null;
		  }

		  _persistEnrollment(enrollment) {
		    if (enrollment == null || ['active', 'cancelled', 'expired'].includes(enrollment.phase)) {
		      clearRecovery(this.storage);
		      this.recovery = null;
		      return;
		    }
		    writeRecovery(this.storage, {
		      profile_handle: enrollment.profileHandle,
		      context_handle: enrollment.contextHandle,
		      enrollment_handle: enrollment.enrollmentHandle,
		      request_id: enrollment.requestId,
		      observed_config_revision: enrollment.observedConfigRevision,
		    });
		    this.recovery = readRecovery(this.storage);
		  }

		  _setEnrollment(generation, patch) {
		    const current = this._currentEnrollment(generation);
		    if (!current) return false;
		    const next = { ...current, ...patch };
		    this._persistEnrollment(next);
		    this._set({ enrollment: next });
		    return true;
		  }

		  async _request(path, payload, options = {}) {
		    const headers = { 'content-type': 'application/json' };
		    if (options.csrf === true) {
		      if (!this.csrfToken) throw new ManagementClientError('csrf_missing');
		      headers[CSRF_HEADER] = this.csrfToken;
		    }
		    let response;
		    try {
		      response = await this.fetchImpl(path, {
		        method: 'POST',
		        credentials: 'same-origin',
		        headers,
		        body: JSON.stringify(payload),
		        ...(options.signal ? { signal: options.signal } : {}),
		      });
		    } catch (error) {
		      throw new ManagementClientError('network_error', { unknown: options.mutation === true });
		    }
		    let parsed = null;
		    try { parsed = await response.json(); } catch { /* handled below */ }
		    if (response.status === 404) {
		      throw new ManagementClientError('management_unavailable', { status: 404 });
		    }
		    if (!response.ok) {
		      const code = safeText(parsed?.error?.code) || (response.status === 403 ? 'management_denied' : 'management_error');
		      throw new ManagementClientError(code, { status: response.status });
		    }
		    if (parsed?.ok !== true) throw new ManagementClientError('protocol_error', { status: response.status });
		    return parsed.value;
		  }

		  ensureStatus() {
		    if (this.authPromise) return this.authPromise;
		    return this.status();
		  }

		  async status() {
		    if (this.authPromise) return this.authPromise;
		    const epoch = this.authEpoch;
		    this._setAuthBusy(true);
		    this._set({ managementStatus: 'checking', error: '' });
		    this.authPromise = this._request(`${this.sessionPath}/status`, {})
		      .then((value) => {
		        if (this.disposed || epoch !== this.authEpoch) return this.snapshot;
		        if (normalizeUnauthenticated(value)) {
		          this.csrfToken = '';
		          this._set({
		            managementStatus: 'unauthenticated',
		            authenticated: false,
		            profiles: [],
		            expiresAt: null,
		            selectedProfileHandle: this.recovery?.profile_handle ?? '',
		            selectedEndpoint: '',
		            notice: '',
		          });
		          return this.snapshot;
		        }
		        const session = normalizeSession(value);
		        this._acceptSession(session);
		        return this.snapshot;
		      })
		      .catch((error) => {
		        if (this.disposed || epoch !== this.authEpoch) return this.snapshot;
		        if (error?.status === 404 || error?.code === 'management_unavailable') {
		          this.csrfToken = '';
		          this._set({
		            managementStatus: 'unconfigured',
		            authenticated: false,
		            profiles: [],
		            expiresAt: null,
		            selectedEndpoint: '',
		            error: '',
		            notice: messageFor('management_unavailable'),
		          });
		        } else if (error?.status === 401 || error?.status === 403) {
		          this.csrfToken = '';
		          this._set({ managementStatus: 'unauthenticated', authenticated: false, profiles: [], expiresAt: null, error: '' });
		        } else {
		          this._set({ managementStatus: 'error', error: managementErrorMessage(error) });
		        }
		        return this.snapshot;
		      })
		      .finally(() => {
		        this.authPromise = null;
		        this._setAuthBusy(false);
		      });
		    return this.authPromise;
		  }

		  _acceptSession(session) {
		    this.csrfToken = session.csrfToken;
		    const selected = session.profiles.some((profile) => profile.handle === this.snapshot.selectedProfileHandle)
		      ? this.snapshot.selectedProfileHandle
		      : session.profiles[0]?.handle ?? '';
		    const profile = session.profiles.find((entry) => entry.handle === selected);
		    const endpoint = profile?.endpoints.includes(this.snapshot.selectedEndpoint)
		      ? this.snapshot.selectedEndpoint
		      : profile?.endpoints[0] ?? '';
		    this._set({
		      managementStatus: 'authenticated',
		      authenticated: true,
		      profiles: session.profiles,
		      expiresAt: session.expiresAt,
		      selectedProfileHandle: selected,
		      selectedEndpoint: endpoint,
		      error: '',
		      notice: '',
		    });
		    void this._restoreEnrollment();
		  }

		  async login(password) {
		    if (this.authBusy || this.disposed) return false;
		    let secret = safeText(password);
		    if (!secret) {
		      this._set({ managementStatus: 'unauthenticated', error: '请输入管理密码。' });
		      return false;
		    }
		    const epoch = ++this.authEpoch;
		    this._setAuthBusy(true);
		    this._set({ managementStatus: 'checking', error: '', notice: '' });
		    try {
		      const value = await this._request(`${this.sessionPath}/login`, { password: secret });
		      if (this.disposed || epoch !== this.authEpoch) return false;
		      const session = normalizeSession(value);
		      this._acceptSession(session);
		      return true;
		    } catch (error) {
		      if (!this.disposed && epoch === this.authEpoch) {
		        if (error?.status === 404 || error?.code === 'management_unavailable') {
		          this._set({ managementStatus: 'unconfigured', authenticated: false, error: '', notice: messageFor('management_unavailable') });
		        } else {
		          this.csrfToken = '';
		          this._set({ managementStatus: 'unauthenticated', authenticated: false, error: managementErrorMessage(error) || '管理登录失败。' });
		        }
		      }
		      return false;
		    } finally {
		      secret = '';
		      this._setAuthBusy(false);
		    }
		  }

		  async logout() {
		    if (this.authBusy || this.disposed || !this.snapshot.authenticated) return false;
		    const epoch = ++this.authEpoch;
		    this._setAuthBusy(true);
		    try {
		      await this._request(`${this.sessionPath}/logout`, {}, { csrf: true });
		      if (this.disposed || epoch !== this.authEpoch) return false;
		      this._clearSession();
		      return true;
		    } catch (error) {
		      if (!this.disposed && epoch === this.authEpoch) {
		        this.csrfToken = '';
		        if (error?.status === 404) {
		          this._clearSession('unconfigured');
		        } else if (error?.unknown) {
		          this._set({ managementStatus: 'error', authenticated: false, error: '退出结果未知，请重新检查管理会话。' });
		        } else {
		          this._clearSession('unauthenticated', managementErrorMessage(error));
		        }
		      }
		      return false;
		    } finally {
		      this._setAuthBusy(false);
		    }
		  }

		  _clearSession(status = 'unauthenticated', error = '') {
		    this.csrfToken = '';
		    this._set({
		      managementStatus: status,
		      authenticated: false,
		      profiles: [],
		      expiresAt: null,
		      selectedEndpoint: '',
		      error,
		    });
		  }

		  selectProfile(handle) {
		    const profile = this.snapshot.profiles.find((entry) => entry.handle === handle);
		    if (!profile) return false;
		    if (isEnrollmentPending(this.snapshot.enrollment)) {
		      this._set({ error: '当前配对仍在进行，完成或明确取消前不能切换 profile。' });
		      return false;
		    }
		    this._set({ selectedProfileHandle: profile.handle, selectedEndpoint: profile.endpoints[0] ?? '', error: '' });
		    return true;
		  }

		  selectEndpoint(endpoint) {
		    const profile = this._profile();
		    if (!profile || !profile.endpoints.includes(endpoint)) {
		      this._set({ error: 'Hub 地址必须来自管理宿主下发的 allowlist。' });
		      return false;
		    }
		    this._set({ selectedEndpoint: endpoint, error: '' });
		    return true;
		  }

		  async begin(endpoint = this.snapshot.selectedEndpoint) {
		    if (this.enrollmentBusy || this.disposed || !this.snapshot.authenticated) return false;
		    if (isEnrollmentPending(this.snapshot.enrollment)) {
		      this._set({ error: '当前配对仍在进行，请完成、取消或刷新当前状态。' });
		      return false;
		    }
		    const profile = this._profile();
		    if (!profile || !profile.endpoints.includes(endpoint)) {
		      this._set({ error: '请选择管理宿主允许的 DSH profile 和 Hub 地址。' });
		      return false;
		    }
		    const generation = ++this.enrollmentGeneration;
		    const enrollment = {
		      generation,
		      profileHandle: profile.handle,
		      profileLabel: profile.label,
		      endpoint,
		      phase: 'beginning',
		      state: 'context_ready',
		      contextHandle: '',
		      enrollmentHandle: '',
		      requestId: '',
		      observedConfigRevision: '',
		      agentId: '',
		      expiresAt: '',
		      saveState: 'unsaved',
		      activationState: 'pending',
		      cleanupState: 'none',
		      error: '',
		    };
		    this._persistEnrollment(enrollment);
		    this._set({ enrollment, error: '' });
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/begin`, {
		        profile_handle: profile.handle,
		        endpoint,
		      }, { csrf: true, mutation: true });
		      if (!this._currentEnrollment(generation)) return false;
		      if (value == null || typeof value !== 'object' || !isValidString(value.context_handle) || !isValidString(value.observed_config_revision)) {
		        throw new ManagementClientError('protocol_error');
		      }
		      this._setEnrollment(generation, {
		        phase: 'context_ready',
		        state: 'context_ready',
		        contextHandle: value.context_handle,
		        observedConfigRevision: value.observed_config_revision,
		        expiresAt: safeText(value.expires_at),
		        profileLabel: safeText(value.target_label) || profile.label,
		        endpoint: safeText(value.endpoint) || endpoint,
		        error: '',
		      });
		      return true;
		    } catch (error) {
		      if (this._currentEnrollment(generation)) {
		        this._setEnrollment(generation, { phase: 'error', state: 'error', error: managementErrorMessage(error) });
		      }
		      return false;
		    } finally {
		      this._setEnrollmentBusy(false);
		    }
		  }

		  async redeem(code) {
		    const enrollment = this.snapshot.enrollment;
		    if (this.enrollmentBusy || this.disposed || !enrollment || enrollment.phase !== 'context_ready') return false;
		    if (enrollment.requestId) {
		      this._set({ error: '当前配对请求已经提交过，不能再次消费同一个配对码；请刷新状态或取消。' });
		      return false;
		    }
		    let secret = safeText(code).trim();
		    if (!secret) {
		      this._set({ error: '请输入 Hub 配对码。' });
		      return false;
		    }
		    const generation = enrollment.generation;
		    const requestId = randomRequestId();
		    this._setEnrollment(generation, {
		      phase: 'redeeming',
		      state: 'redeem_in_progress',
		      requestId,
		      error: '',
		    });
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/redeem`, {
		        profile_handle: enrollment.profileHandle,
		        context_handle: enrollment.contextHandle,
		        request_id: requestId,
		        code: secret,
		      }, { csrf: true, mutation: true });
		      if (!this._currentEnrollment(generation)) return false;
		      const safe = normalizeEnrollment(value);
		      if (!isValidString(safe.enrollment_handle) || !isValidString(safe.agent_id)) throw new ManagementClientError('protocol_error');
		      this._setEnrollment(generation, {
		        phase: 'pending_save',
		        state: 'pending_save',
		        enrollmentHandle: safe.enrollment_handle,
		        agentId: safe.agent_id,
		        expiresAt: safe.expires_at ?? enrollment.expiresAt,
		        saveState: safe.save_state ?? 'unsaved',
		        activationState: safe.activation_state ?? 'pending',
		        cleanupState: safe.cleanup_state ?? 'none',
		        error: '',
		      });
		      return true;
		    } catch (error) {
		      if (error?.unknown && this._currentEnrollment(generation)) {
		        await this._recoverUnknown(generation, enrollment.contextHandle);
		      } else if (this._currentEnrollment(generation)) {
		        this._setEnrollment(generation, { phase: 'error', state: 'error', error: managementErrorMessage(error) });
		      }
		      return false;
		    } finally {
		      secret = '';
		      this._setEnrollmentBusy(false);
		    }
		  }

		  async _recoverUnknown(generation, handle) {
		    if (!this._currentEnrollment(generation)) return false;
		    this._setEnrollment(generation, { phase: 'recovering', state: 'redeem_in_progress', error: '配对结果未知，正在用原 context_handle 查询状态；不会再次提交配对码。' });
		    try {
		      const value = await this._request(`${this.enrollmentPath}/status`, {
		        profile_handle: this._currentEnrollment(generation).profileHandle,
		        enrollment_handle: handle,
		      }, { csrf: true });
		      return this._applyStatus(generation, value, true);
		    } catch (error) {
		      if (error?.status === 403 || error?.code === 'management_denied') this._dropInaccessibleRecovery(generation);
		      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, {
		        phase: 'unknown',
		        state: 'error',
		        error: '无法确认配对结果，请重试状态或取消；不会再次提交配对码。',
		      });
		      return false;
		    }
		  }

		  _applyStatus(generation, value, recovering = false) {
		    const current = this._currentEnrollment(generation);
		    if (!current) return false;
		    let safe;
		    try { safe = normalizeEnrollment(value); } catch (error) {
		      this._setEnrollment(generation, { phase: recovering ? 'unknown' : 'error', state: 'error', error: managementErrorMessage(error) });
		      return false;
		    }
		    const phase = safe.state === 'context_ready' && (recovering || current.requestId)
		      ? (recovering ? 'unknown' : 'context_ready')
		      : safe.state === 'redeem_in_progress' ? 'recovering'
		        : safe.state === 'pending_save' ? 'pending_save'
		          : safe.state === 'commit_in_progress' ? 'committing'
		            : safe.state;
		    const next = {
		      phase,
		      state: safe.state,
		      enrollmentHandle: safe.enrollment_handle ?? current.enrollmentHandle,
		      agentId: safe.agent_id ?? current.agentId,
		      expiresAt: safe.expires_at ?? current.expiresAt,
		      observedConfigRevision: current.observedConfigRevision,
		      saveState: safe.save_state ?? current.saveState,
		      activationState: safe.activation_state ?? current.activationState,
		      cleanupState: safe.cleanup_state ?? current.cleanupState,
		      commitId: safe.commit_id ?? current.commitId,
		      configRevision: safe.config_revision ?? current.configRevision,
		      error: safe.retryable_error?.code ? messageFor(safe.retryable_error.code) : '',
		    };
		    if (phase === 'active') {
		      next.activationState = 'active';
		      next.error = '';
		    }
		    if (phase === 'saved' && next.activationState === 'active') next.phase = 'active';
		    if (['cancelled', 'expired'].includes(phase)) {
		      next.error = '';
		      this._persistEnrollment(null);
		    }
		    this._setEnrollment(generation, next);
		    if (phase === 'active') clearRecovery(this.storage);
		    return true;
		  }

		  async refreshEnrollment() {
		    const enrollment = this.snapshot.enrollment;
		    if (this.enrollmentBusy || this.disposed || !enrollment) return false;
		    const generation = enrollment.generation;
		    const handle = enrollment.enrollmentHandle || enrollment.contextHandle;
		    if (!handle) return false;
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/status`, {
		        profile_handle: enrollment.profileHandle,
		        enrollment_handle: handle,
		      }, { csrf: true });
		      return this._applyStatus(generation, value, enrollment.phase === 'unknown');
		    } catch (error) {
		      if (error?.status === 403 || error?.code === 'management_denied') this._dropInaccessibleRecovery(generation);
		      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, { error: managementErrorMessage(error) });
		      return false;
		    } finally {
		      this._setEnrollmentBusy(false);
		    }
		  }

		  async commit(confirmed) {
		    const enrollment = this.snapshot.enrollment;
		    if (this.enrollmentBusy || this.disposed || !enrollment || enrollment.phase !== 'pending_save') return false;
		    if (confirmed !== true) {
		      this._set({ error: '请明确确认 Hub 返回的身份后再保存。' });
		      return false;
		    }
		    if (!enrollment.enrollmentHandle || !enrollment.agentId || !enrollment.observedConfigRevision) {
		      this._set({ error: '缺少原始配对上下文，先刷新状态。' });
		      return false;
		    }
		    const generation = enrollment.generation;
		    this._setEnrollment(generation, { phase: 'committing', state: 'commit_in_progress', error: '' });
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/commit`, {
		        profile_handle: enrollment.profileHandle,
		        enrollment_handle: enrollment.enrollmentHandle,
		        expected_config_revision: enrollment.observedConfigRevision,
		        confirmed_agent_id: enrollment.agentId,
		      }, { csrf: true, mutation: true });
		      if (!this._currentEnrollment(generation)) return false;
		      const safe = normalizeEnrollment(value);
		      this._setEnrollment(generation, {
		        phase: safe.state === 'active' ? 'active' : 'saved',
		        state: safe.state,
		        saveState: safe.save_state ?? 'saved',
		        activationState: safe.activation_state ?? 'restart_required',
		        cleanupState: safe.cleanup_state ?? enrollment.cleanupState,
		        configRevision: safe.config_revision ?? enrollment.configRevision,
		        commitId: safe.commit_id ?? enrollment.commitId,
		        error: '',
		      });
		      if (safe.state === 'active') clearRecovery(this.storage);
		      return true;
		    } catch (error) {
		      if (error?.unknown && this._currentEnrollment(generation)) {
		        await this.refreshEnrollment();
		      } else if (this._currentEnrollment(generation)) {
		        this._setEnrollment(generation, { phase: 'error', state: 'error', error: managementErrorMessage(error) });
		      }
		      return false;
		    } finally {
		      this._setEnrollmentBusy(false);
		    }
		  }

		  async activate() {
		    const enrollment = this.snapshot.enrollment;
		    if (this.enrollmentBusy || this.disposed || !enrollment || !['saved', 'active'].includes(enrollment.phase)) return false;
		    if (!enrollment.enrollmentHandle) return false;
		    const generation = enrollment.generation;
		    this._setEnrollment(generation, { phase: 'activating', error: '' });
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/activate`, {
		        profile_handle: enrollment.profileHandle,
		        enrollment_handle: enrollment.enrollmentHandle,
		      }, { csrf: true, mutation: true });
		      if (!this._currentEnrollment(generation)) return false;
		      const safe = normalizeEnrollment(value);
		      this._setEnrollment(generation, {
		        phase: safe.state === 'active' ? 'active' : 'saved',
		        state: safe.state,
		        activationState: safe.activation_state ?? 'active',
		        saveState: safe.save_state ?? enrollment.saveState,
		        cleanupState: safe.cleanup_state ?? enrollment.cleanupState,
		        error: '',
		      });
		      if (safe.state === 'active') clearRecovery(this.storage);
		      return safe.state === 'active';
		    } catch (error) {
		      if (this._currentEnrollment(generation)) {
		        this._setEnrollment(generation, {
		          phase: error?.unknown ? 'saved' : 'saved',
		          state: 'saved',
		          activationState: 'error',
		          error: managementErrorMessage(error),
		        });
		      }
		      return false;
		    } finally {
		      this._setEnrollmentBusy(false);
		    }
		  }

		  async cancel() {
		    const enrollment = this.snapshot.enrollment;
		    if (this.enrollmentBusy || this.disposed || !enrollment || !isEnrollmentPending(enrollment)) return false;
		    const handle = enrollment.enrollmentHandle || enrollment.contextHandle;
		    if (!handle) return false;
		    const generation = enrollment.generation;
		    this._setEnrollment(generation, { phase: 'cancelling', error: '' });
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/cancel`, {
		        profile_handle: enrollment.profileHandle,
		        enrollment_handle: handle,
		      }, { csrf: true, mutation: true });
		      if (!this._currentEnrollment(generation)) return false;
		      const safe = normalizeEnrollment(value);
		      if (!['cancelled', 'expired', 'cleanup_pending', 'cleanup_conflict'].includes(safe.state)) throw new ManagementClientError('protocol_error');
		      this._setEnrollment(generation, {
		        phase: safe.state,
		        state: safe.state,
		        cleanupState: safe.cleanup_state ?? (safe.state === 'cleanup_pending' ? 'pending' : safe.state === 'cleanup_conflict' ? 'conflict' : 'complete'),
		        error: safe.state === 'cleanup_pending' ? messageFor('cleanup_pending') : safe.state === 'cleanup_conflict' ? messageFor('cleanup_conflict') : '',
		      });
		      return ['cancelled', 'expired'].includes(safe.state);
		    } catch (error) {
		      if (error?.unknown) await this.refreshEnrollment();
		      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, {
		        phase: error?.code === 'cleanup_conflict' ? 'cleanup_conflict' : 'cleanup_pending',
		        state: error?.code === 'cleanup_conflict' ? 'cleanup_conflict' : 'error',
		        error: managementErrorMessage(error),
		      });
		      return false;
		    } finally {
		      this._setEnrollmentBusy(false);
		    }
		  }

		  clearCompletedEnrollment() {
		    if (isEnrollmentPending(this.snapshot.enrollment)) {
		      this._set({ error: '当前配对仍在进行，不能清除其恢复信息。' });
		      return false;
		    }
		    this._persistEnrollment(null);
		    this._set({ enrollment: null, error: '' });
		    return true;
		  }

		  clearRecoveryMetadata() {
		    clearRecovery(this.storage);
		    this.recovery = null;
		    this._set({ notice: '已清除本地恢复句柄；这不等于取消 Hub 上的 pending enrollment。', error: '' });
		    return true;
		  }

		  async _restoreEnrollment() {
		    const recovery = this.recovery ?? readRecovery(this.storage);
		    if (!recovery || this.snapshot.managementStatus !== 'authenticated' || this.snapshot.enrollment) return false;
		    const profile = this.snapshot.profiles.find((entry) => entry.handle === recovery.profile_handle);
		    if (!profile) {
		      this.clearRecoveryMetadata();
		      this._set({ notice: '保存的恢复信息不属于当前管理账号，已清除本地恢复句柄。' });
		      return false;
		    }
		    const generation = ++this.enrollmentGeneration;
		    const enrollment = {
		      generation,
		      profileHandle: profile.handle,
		      profileLabel: profile.label,
		      endpoint: '',
		      phase: recovery.request_id && !recovery.enrollment_handle ? 'unknown' : 'recovering',
		      state: 'redeem_in_progress',
		      contextHandle: recovery.context_handle ?? '',
		      enrollmentHandle: recovery.enrollment_handle ?? '',
		      requestId: recovery.request_id ?? '',
		      observedConfigRevision: recovery.observed_config_revision ?? '',
		      agentId: '',
		      expiresAt: '',
		      saveState: 'unsaved',
		      activationState: 'pending',
		      cleanupState: 'none',
		      error: '正在恢复上次 enrollment 状态。',
		    };
		    this._set({ enrollment, selectedProfileHandle: profile.handle, selectedEndpoint: profile.endpoints[0] ?? '', error: '' });
		    this._setEnrollmentBusy(true);
		    try {
		      const value = await this._request(`${this.enrollmentPath}/status`, {
		        profile_handle: profile.handle,
		        enrollment_handle: recovery.enrollment_handle || recovery.context_handle,
		      }, { csrf: true });
		      return this._applyStatus(generation, value, Boolean(recovery.request_id && !recovery.enrollment_handle));
		    } catch (error) {
		      if (error?.status === 403 || error?.code === 'management_denied') this._dropInaccessibleRecovery(generation);
		      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, { phase: 'unknown', state: 'error', error: '无法恢复保存的 enrollment 状态，请重试状态或清除本地恢复信息。' });
		      return false;
		    } finally {
		      this._setEnrollmentBusy(false);
		    }
		  }

		  _dropInaccessibleRecovery(generation) {
		    clearRecovery(this.storage);
		    this.recovery = null;
		    if (this._currentEnrollment(generation)) this._set({
		      enrollment: null,
		      notice: '当前管理账号无法访问保存的 enrollment，已清除本地恢复句柄。Hub 状态未被自动取消。',
		      error: '',
		    });
		  }

		  dispose() {
		    this.disposed = true;
		    this.authEpoch += 1;
		    this.csrfToken = '';
		    this.listeners.clear();
		  }
		}

		const controllerByOwner = new WeakMap();

		function getManagementController(owner) {
		  if (owner == null || (typeof owner !== 'object' && typeof owner !== 'function')) {
		    throw new TypeError('management controller owner must be an object');
		  }
		  let controller = controllerByOwner.get(owner);
		  if (!controller || controller.disposed) {
		    controller = new ManagementController();
		    controllerByOwner.set(owner, controller);
		  }
		  return controller;
		}
		// Sessions is a core DSH client service, independent of Agent Mail MCP.
		const inject = ['sessions'];

		const CARD_TOOLS = [
		  publicToolName('comm_inbox'),
		  publicToolName('comm_send'),
		  publicToolName('comm_approvals'),
		  publicToolName('comm_diagnose'),
		];

		const unreadCache = { count: null, listeners: new Set() };
		let localSentSequence = 0;

		function apply(ctx) {
		  ctx.effect(() => bindSurfaces(ctx));
		  ctx.effect(() => {
		    const controller = getManagementController(ctx);
		    return () => controller.dispose();
		  });
		  const slots = ctx.get?.('slots');
		  if (!slots?.inject) return;
		  for (const toolName of CARD_TOOLS) {
		    try {
		      slots.inject('tool.call.toolview', () => slots.register(
		        { name: 'tool.call.toolview', key: toolName },
		        (owner) => h(ToolCard, { toolName, owner }),
		      ));
		    } catch (error) {
		      console.error('[dsh-agent-mail-ui] tool card failed', error);
		    }
		  }
		  try {
		    slots.inject('settings.section', () => slots.register({
		      name: 'settings.section',
		      id: 'dsh-agent-mail-ui',
		      order: 110,
		      label: () => 'Agent Mail',
		    }, () => h('div', { style: { fontSize: 12, lineHeight: 1.5 } },
		      '启用 better-sidebar：打开右侧面板，点击“+”→“Agent Mail”。未启用时：使用右下角的邮件按钮。',
		    )));
		  } catch (error) {
		    console.error('[dsh-agent-mail-ui] settings section failed', error);
		  }
		}

		function tabDescriptor(ctx) {
		  return {
		    id: TAB_ID,
		    title: 'Agent Mail',
		    order: 40,
		    single: true,
		    icon: (size) => envelopeIcon(size ?? 16),
		    badge: () => unreadCache.count,
		    component: (props) => h(MailPanel, { ...props, pluginCtx: ctx }),
		  };
		}

		function bindSurfaces(ctx) {
		  let tabOff = () => {};
		  let standaloneOff = () => {};
		  let injectOff = () => {};

		  const useSidebar = (sidebar) => {
		    if (!sidebar?.registerTab) return false;
		    try {
		      if (typeof sidebar.getTab === 'function' && sidebar.getTab(TAB_ID)) {
		        standaloneOff();
		        standaloneOff = () => {};
		        return true;
		      }
		      tabOff();
		      tabOff = sidebar.registerTab(tabDescriptor(ctx));
		      standaloneOff();
		      standaloneOff = () => {};
		      return true;
		    } catch (error) {
		      console.error('[dsh-agent-mail-ui] registerTab failed', error);
		      return false;
		    }
		  };

		  if (!useSidebar(ctx.get?.('betterSidebar'))) {
		    standaloneOff = mountStandalone(ctx);
		  }
		  if (typeof ctx.inject === 'function') {
		    const handle = ctx.inject(['betterSidebar'], (sctx) => {
		      useSidebar(sctx.betterSidebar);
		    });
		    if (typeof handle === 'function') injectOff = handle;
		  }
		  return () => {
		    try { injectOff(); } catch { /* already gone */ }
		    tabOff();
		    standaloneOff();
		  };
		}

		function mountStandalone(ctx) {
		  const host = document.createElement('div');
		  host.setAttribute('data-dsh-agent-mail-ui', 'standalone');
		  document.body.appendChild(host);
		  const root = createRoot(host);
		  root.render(h(StandaloneShell, { ctx }));
		  return () => {
		    root.unmount();
		    host.remove();
		  };
		}

		function StandaloneShell({ ctx }) {
		  const [open, setOpen] = useState(false);
		  const scope = useCurrentScope(ctx, open);
		  return h('div', null,
		    h('button', {
		      type: 'button',
		      style: fabStyle,
		      title: 'Agent Mail',
		      'data-agent-mail-action': 'open-mail',
		      onClick: () => setOpen((value) => !value),
		    }, envelopeIcon(16), ' Mail'),
		    open && h('div', { style: drawerStyle },
		      h(MailPanel, { pluginCtx: ctx, ctx, scope, visible: true }),
		    ),
		  );
		}

		function currentScope(ctx) {
		  try {
		    return sessionScope(ctx?.sessions?.list?.getSnapshot?.());
		  } catch {
		    return {};
		  }
		}

		function useCurrentScope(ctx, enabled) {
		  const list = ctx?.sessions?.list;
		  const subscribe = useCallback((listener) => {
		    if (!enabled || typeof list?.subscribe !== 'function') return () => {};
		    return list.subscribe(listener);
		  }, [enabled, list]);
		  const getSnapshot = useCallback(() => {
		    return currentScope(ctx).sessionId;
		  }, [ctx]);
		  const sessionId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
		  return useMemo(() => (sessionId ? { sessionId } : {}), [sessionId]);
		}

		function MailPanel({ pluginCtx, ctx, scope, visible }) {
		  const [status, setStatus] = useState(null);
		  const [diagnose, setDiagnose] = useState(null);
		  const [items, setItems] = useState([]);
		  const [agents, setAgents] = useState([]);
		  const [unreadOnly, setUnreadOnly] = useState(true);
		  const [panelView, setPanelView] = useState('inbox');
		  const [composeReturnView, setComposeReturnView] = useState('inbox');
		  const [sentRecords, setSentRecords] = useState([]);
		  const [sentCapability, setSentCapability] = useState('unknown');
		  const [sentLastRefresh, setSentLastRefresh] = useState(null);
		  const [sentError, setSentError] = useState('');
		  const [sentPollStopped, setSentPollStopped] = useState(false);
		  const [recipientInfo, setRecipientInfo] = useState(null);
		  const [recipientInfoId, setRecipientInfoId] = useState('');
		  const [recipientInfoError, setRecipientInfoError] = useState('');
		  const [recipientInfoBusy, setRecipientInfoBusy] = useState(false);
		  const [selected, setSelected] = useState(null);
		  const [thread, setThread] = useState([]);
		  const [error, setError] = useState('');
		  const [draft, setDraft] = useState({ to: '', body: '', type: 'task' });
		  const [doneBody, setDoneBody] = useState(DEFAULT_DONE_BODY);
		  const [terminalTaskIds, setTerminalTaskIds] = useState(() => new Set());
		  const [claimReady, setClaimReady] = useState(false);
		  const [busy, setBusy] = useState(false);
		  const [lastRefresh, setLastRefresh] = useState(null);
		  const [lastAgentsRefresh, setLastAgentsRefresh] = useState(null);
		  const [listPaneSize, setListPaneSize] = useState(null);
		  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
		  const [managementOpen, setManagementOpen] = useState(false);
		  const managementController = useMemo(
		    () => getManagementController(pluginCtx),
		    [pluginCtx],
		  );
		  const managementSnapshot = useSyncExternalStore(
		    useCallback((listener) => managementController.subscribe(listener), [managementController]),
		    () => managementController.getSnapshot(),
		    () => managementController.getSnapshot(),
		  );
		  const listRef = useRef(null);
		  const resizeRef = useRef(null);
		  const selectedRef = useRef(selected);
		  const operationRef = useRef(false);
		  const refreshInFlightRef = useRef(false);
		  const sentRefreshInFlightRef = useRef(null);
		  const sentRequestSequenceRef = useRef(0);
		  const sentGenerationRef = useRef(0);
		  const sentMountedRef = useRef(false);
		  const sentIdentityRef = useRef(null);
		  const sentRecordsRef = useRef(sentRecords);
		  selectedRef.current = selected;
		  sentRecordsRef.current = sentRecords;

		  const summary = useMemo(() => (diagnose ? diagnoseSummary(diagnose) : null), [diagnose]);
		  const pendingSentCount = useMemo(
		    () => sentRecords.filter(isPendingSentItem).length,
		    [sentRecords],
		  );
		  const selfId = knownAgentId(summary?.agentId);
		  const recipients = selfId
		    ? agents.filter((id) => id && id !== selfId && id !== 'human@local')
		    : [];
		  const draftRecipient = String(draft.to ?? '').trim();
		  const sendReady = Boolean(
		    selfId
		    && status?.live === true
		    && recipients.includes(draftRecipient)
		    && String(draft.body ?? '').trim(),
		  );

		  const [pageActive, setPageActive] = useState(() => isPagePollingActive());

		  useEffect(() => {
		    const documentTarget = typeof document === 'undefined' ? null : document;
		    const windowTarget = typeof window === 'undefined' ? null : window;
		    const update = () => setPageActive(isPagePollingActive());
		    documentTarget?.addEventListener?.('visibilitychange', update);
		    windowTarget?.addEventListener?.('online', update);
		    windowTarget?.addEventListener?.('offline', update);
		    update();
		    return () => {
		      documentTarget?.removeEventListener?.('visibilitychange', update);
		      windowTarget?.removeEventListener?.('online', update);
		      windowTarget?.removeEventListener?.('offline', update);
		    };
		  }, []);

		  const beginOperation = () => {
		    if (operationRef.current) return false;
		    operationRef.current = true;
		    setBusy(true);
		    return true;
		  };

		  const endOperation = () => {
		    operationRef.current = false;
		    setBusy(false);
		  };

		  const clearSelectedSent = useCallback(() => {
		    const current = selectedRef.current;
		    if (current?.durable !== true && current?.localOnly !== true) return;
		    setSelected(null);
		    setThread([]);
		    setClaimReady(false);
		  }, []);

		  const resetSentHistory = useCallback(() => {
		    sentGenerationRef.current += 1;
		    sentRefreshInFlightRef.current = null;
		    setSentRecords([]);
		    setSentCapability('unknown');
		    setSentLastRefresh(null);
		    setSentError('');
		    setSentPollStopped(false);
		    clearSelectedSent();
		  }, [clearSelectedSent]);

		  useEffect(() => {
		    sentMountedRef.current = true;
		    return () => {
		      sentMountedRef.current = false;
		      sentGenerationRef.current += 1;
		      sentRefreshInFlightRef.current = null;
		    };
		  }, []);

		  useEffect(() => {
		    if (sentIdentityRef.current === selfId) return;
		    sentIdentityRef.current = selfId;
		    resetSentHistory();
		  }, [selfId, resetSentHistory]);

		  const refresh = useCallback(async (manageBusy = true) => {
		    if (refreshInFlightRef.current) return false;
		    refreshInFlightRef.current = true;
		    if (manageBusy) setBusy(true);
		    setError('');
		    try {
		      const nextStatus = await api('status');
		      setStatus(nextStatus);
		      if (nextStatus?.live !== true) {
		        setItems([]);
		        setAgents([]);
		        setDiagnose(null);
		        setThread([]);
		        setSelected(null);
		        setClaimReady(false);
		        setLastRefresh({ at: Date.now(), ok: true });
		        unreadCache.count = null;
		        notifyBadge();
		        return true;
		      }
		      const [diagnoseResult, inboxResult, agentsResult] = await Promise.allSettled([
		        api('diagnose'),
		        api('inbox', { unread_only: unreadOnly }),
		        api('agents'),
		      ]);
		      const readErrors = [];
		      let list = [];
		      if (diagnoseResult.status === 'fulfilled') {
		        setDiagnose(diagnoseResult.value);
		      } else {
		        setDiagnose(null);
		        readErrors.push('诊断读取失败');
		      }
		      if (inboxResult.status === 'fulfilled') {
		        list = inboxItems(inboxResult.value);
		        setItems(list);
		      } else {
		        setItems([]);
		        setSelected((current) => current?.localOnly ? current : null);
		        setThread((current) => selectedRef.current?.localOnly ? current : []);
		        setClaimReady(false);
		        readErrors.push('收件箱读取失败');
		      }
		      if (agentsResult.status === 'fulfilled') {
		        setAgents(agentList(agentsResult.value));
		        setLastAgentsRefresh({ at: Date.now(), ok: true });
		      } else {
		        setAgents([]);
		        setLastAgentsRefresh({ at: Date.now(), ok: false });
		        readErrors.push('收件人读取失败');
		      }
		      unreadCache.count = inboxResult.status === 'fulfilled' ? unreadBadge(list) : null;
		      notifyBadge();
		      if (inboxResult.status === 'fulfilled') {
		        const currentSelected = selectedRef.current;
		        let latestSelected = currentSelected?.messageId
		          ? list.find((item) => item.messageId === currentSelected.messageId)
		          : undefined;
		        if (currentSelected?.messageId && !currentSelected.localOnly && !latestSelected && unreadOnly) {
		          try {
		            const allMail = inboxItems(await api('inbox', { unread_only: false }));
		            latestSelected = allMail.find((item) => item.messageId === currentSelected.messageId);
		          } catch {
		            setSelected((current) => current ? { ...current, deliveryStatus: '' } : current);
		            setClaimReady(false);
		            setError('无法确认当前消息的投递状态；详情可能不是最新。');
		          }
		        }
		        if (latestSelected) {
		          setSelected((current) => current ? { ...current, ...latestSelected } : current);
		          setClaimReady(latestSelected.deliveryStatus === 'claimed');
		          if (latestSelected.threadId) {
		            try {
		              const tailed = await api('tail', { thread_id: latestSelected.threadId });
		              setThread(threadMessages(tailed));
		            } catch {
		              setError('收件箱已刷新，但详情刷新失败；当前详情可能不是最新。');
		            }
		          }
		        } else if (currentSelected?.messageId && !currentSelected.localOnly && unreadOnly) {
		          setSelected((current) => current ? { ...current, deliveryStatus: '' } : current);
		          setClaimReady(false);
		          setError((current) => current || '当前消息不在全量邮箱中，投递状态未知。');
		        }
		      }
		      if (readErrors.length > 0) {
		        setLastRefresh({ at: Date.now(), ok: false });
		        setError(`${readErrors.join('、')}。可手动重试。`);
		        return false;
		      }
		      setLastRefresh({ at: Date.now(), ok: true });
		      return true;
		    } catch (err) {
		      setStatus(null);
		      setItems([]);
		      setAgents([]);
		      setDiagnose(null);
		      setThread([]);
		      setClaimReady(false);
		      unreadCache.count = null;
		      notifyBadge();
		      setLastRefresh({ at: Date.now(), ok: false });
		      setError(`Agent Mail 状态读取失败：${err instanceof Error ? err.message : String(err)}。可手动重试。`);
		      return false;
		    } finally {
		      refreshInFlightRef.current = false;
		      if (manageBusy) setBusy(false);
		    }
		  }, [unreadOnly]);

		  const refreshSent = useCallback(async ({ manageBusy = false, silent = false } = {}) => {
		    if (sentRefreshInFlightRef.current !== null) return { ok: false, skipped: true };
		    const requestId = ++sentRequestSequenceRef.current;
		    const requestGeneration = sentGenerationRef.current;
		    sentRefreshInFlightRef.current = requestId;
		    const isCurrent = () => sentMountedRef.current
		      && sentGenerationRef.current === requestGeneration
		      && sentRefreshInFlightRef.current === requestId;
		    if (manageBusy) setBusy(true);
		    if (!silent) setSentError('');
		    try {
		      const parsed = sentItems(await api('sent', { limit: SENT_HISTORY_LIMIT }), selfId);
		      if (!isCurrent()) return { ok: false, stale: true };
		      if (parsed.error) {
		        const message = parsed.error === 'sender-identity-mismatch'
		          ? '发送历史身份校验失败，已隐藏这次结果。'
		          : 'Agent Mail provider 未返回发送身份，无法安全显示持久历史。';
		        throw Object.assign(new Error(message), { code: 'sent-history-invalid' });
		      }
		      setSentCapability('available');
		      setSentLastRefresh({ at: Date.now(), ok: true });
		      setSentError('');
		      const merged = mergeSentRecords(
		        parsed.items,
		        sentRecordsRef.current.filter((item) => item.localOnly === true),
		      );
		      setSentRecords(merged);
		      const currentSelected = selectedRef.current;
		      if (currentSelected?.durable === true || currentSelected?.localOnly === true) {
		        const latest = merged.find((item) => (
		          (currentSelected.messageId && item.messageId === currentSelected.messageId)
		          || (!currentSelected.messageId && item.localKey === currentSelected.localKey)
		        ));
		        if (latest) {
		          setSelected(latest);
		          if (latest.messageId) {
		            setThread((current) => current.map((entry) => (
		              entry.messageId === latest.messageId
		                ? { ...entry, ...latest }
		                : entry
		            )));
		          }
		        } else {
		          clearSelectedSent();
		        }
		      }
		      return { ok: true, items: parsed.items };
		    } catch (err) {
		      if (!isCurrent()) return { ok: false, stale: true };
		      const unsupported = err?.code === 'mcp-unavailable';
		      if (unsupported) {
		        setSentCapability('unsupported');
		        setSentRecords((current) => current.filter((item) => item.localOnly === true));
		        clearSelectedSent();
		        setSentError('当前 Agent Mail provider 不支持持久发送历史，请升级 provider 后再查看。');
		      } else if (err?.code === 'sent-history-invalid') {
		        setSentCapability('error');
		        setSentRecords([]);
		        clearSelectedSent();
		        setSentError(err instanceof Error ? err.message : String(err));
		      } else {
		        setSentCapability((current) => current === 'unknown' ? 'error' : current);
		        setSentError(err instanceof Error ? err.message : String(err));
		      }
		      setSentLastRefresh({ at: Date.now(), ok: false });
		      return { ok: false, unsupported };
		    } finally {
		      if (sentRefreshInFlightRef.current === requestId) {
		        sentRefreshInFlightRef.current = null;
		        if (manageBusy) setBusy(false);
		      }
		    }
		  }, [selfId, clearSelectedSent]);

		  const refreshAll = useCallback(async (manageBusy = true) => {
		    setSentPollStopped(false);
		    const refreshed = await refresh(manageBusy);
		    if (refreshed) await refreshSent({ manageBusy: false });
		    return refreshed;
		  }, [refresh, refreshSent]);

		  useEffect(() => {
		    if (!visible || !pageActive) return undefined;
		    void refresh();
		    return undefined;
		  }, [visible, pageActive, refresh]);

		  useEffect(() => {
		    if (!visible || !pageActive || status?.live !== true || !selfId) return undefined;
		    void refreshSent();
		    return undefined;
		  }, [visible, pageActive, status?.live, selfId, refreshSent]);

		  useEffect(() => {
		    if (
		      !visible
		      || !pageActive
		      || panelView !== 'sent'
		      || status?.live !== true
		      || sentCapability === 'unsupported'
		      || sentPollStopped
		      || pendingSentCount === 0
		    ) return undefined;
		    let stopped = false;
		    let timer;
		    let attempts = 0;
		    let delay = SENT_POLL_INTERVAL_MS;
		    const schedule = () => {
		      if (stopped || attempts >= SENT_POLL_MAX_ATTEMPTS) {
		        if (!stopped) setSentPollStopped(true);
		        return;
		      }
		      timer = setTimeout(async () => {
		        if (stopped || !isPagePollingActive()) return;
		        attempts += 1;
		        const result = await refreshSent({ silent: true });
		        if (stopped || result.stale || !isPagePollingActive()) return;
		        delay = nextSentPollDelay(delay, result.ok);
		        if (attempts >= SENT_POLL_MAX_ATTEMPTS) {
		          setSentPollStopped(true);
		          return;
		        }
		        schedule();
		      }, delay);
		    };
		    schedule();
		    return () => {
		      stopped = true;
		      clearTimeout(timer);
		    };
		  }, [visible, pageActive, panelView, status?.live, sentCapability, sentPollStopped, pendingSentCount, refreshSent]);

		  useEffect(() => {
		    if (visible) void managementController.ensureStatus();
		  }, [visible, managementController]);

		  const openThread = async (item) => {
		    if (!beginOperation()) return;
		    if (item.messageId !== selected?.messageId) setDoneBody(DEFAULT_DONE_BODY);
		    setSelected(item);
		    setThread([]);
		    setClaimReady(false);
		    setError('');
		    let claimed = false;
		    try {
		      const isSent = panelView === 'sent' || item.localOnly === true || item.durable === true;
		      if (!isSent && item.messageId && item.deliveryStatus !== 'outbound' && item.deliveryStatus !== 'acked') {
		        await api('claim', { message_id: item.messageId });
		        claimed = true;
		        setClaimReady(true);
		        setItems((current) => current.map((currentItem) => (
		          currentItem.messageId === item.messageId
		            ? { ...currentItem, deliveryStatus: 'claimed', claimed: true }
		            : currentItem
		        )));
		        setSelected((current) => current
		          ? { ...current, deliveryStatus: 'claimed', claimed: true }
		          : current);
		      }
		      if (item.localOnly || !item.threadId) {
		        setThread([item]);
		      } else if (item.threadId) {
		        const tailed = await api('tail', { thread_id: item.threadId });
		        setThread(threadMessages(tailed));
		      }
		    } catch (err) {
		      const detail = err instanceof Error ? err.message : String(err);
		      setError(claimed ? `消息已领取，但详情读取失败：${detail}` : detail);
		    } finally {
		      endOperation();
		    }
		  };

		  const runAction = async (method, payload) => {
		    if (!beginOperation()) return;
		    setError('');
		    let actionSucceeded = false;
		    try {
		      const result = await api(method, payload);
		      actionSucceeded = true;
		      if (method === 'send') {
		        const record = sentRecord(result, payload, summary?.agentId ?? '');
		        setSentRecords((current) => [record, ...current]);
		        setSentPollStopped(false);
		      }
		      if (
		        method === 'send'
		        && payload.task_id
		        && ['done', 'error', 'cancel'].includes(payload.type)
		      ) {
		        setTerminalTaskIds((current) => new Set(current).add(payload.task_id));
		      }
		      if (method === 'ack') {
		        setClaimReady(false);
		        setItems((current) => current.map((item) => (
		          item.messageId === payload.message_id
		            ? { ...item, deliveryStatus: 'acked', unread: false }
		            : item
		        )));
		        setSelected((current) => current ? { ...current, deliveryStatus: 'acked' } : current);
		      }
		    } catch (err) {
		      setError(err instanceof Error ? err.message : String(err));
		      endOperation();
		      return;
		    }
		    try {
		      const refreshed = await refresh(false);
		      if (!refreshed) {
		        setError('操作已成功，但刷新失败；请手动刷新确认状态。');
		      }
		      if (refreshed && method === 'send') await refreshSent({ silent: true });
		      const currentSelected = selectedRef.current;
		      if (refreshed && currentSelected?.threadId) {
		        const tailed = await api('tail', { thread_id: currentSelected.threadId });
		        setThread(threadMessages(tailed));
		      }
		    } catch (err) {
		      setError(actionSucceeded
		        ? `操作已成功，但详情刷新失败：${err instanceof Error ? err.message : String(err)}`
		        : (err instanceof Error ? err.message : String(err)));
		    } finally {
		      endOperation();
		    }
		  };

		  const quote = (item) => {
		    const sessionId = scope?.sessionId;
		    const text = quoteComposerText(item);
		    // Tab props.ctx is the sidebar fiber (sessions + conversation). pluginCtx
		    // is this package's own fiber and does not see those services.
		    if (!sessionId || !(appendToDraft(ctx, sessionId, text) || appendToDraft(pluginCtx, sessionId, text))) {
		      setError('无法插入当前对话的输入框');
		    }
		  };

		  const sendDraft = async () => {
		    if (!sendReady || refreshInFlightRef.current) {
		      setError('请先确认通信工具已加载、身份已知、收件人仍在当前目录，并填写正文。');
		      return;
		    }
		    if (!beginOperation()) return;
		    setError('');
		    let sent;
		    try {
		      const outgoing = { ...draft, to: draftRecipient, body: draft.body.trim(), effect: 'read' };
		      sent = await api('send', outgoing);
		      const created = sentRecord(sent, outgoing, summary?.agentId ?? '');
		      setSentRecords((current) => [created, ...current]);
		      setSentPollStopped(false);
		      setDraft({ to: '', body: '', type: 'task' });
		      setPanelView('sent');
		      setSelected(created);
		      setThread([created]);
		      setClaimReady(false);
		    } catch (err) {
		      setError(err instanceof Error ? err.message : String(err));
		      endOperation();
		      return;
		    }
		    try {
		      const refreshed = await refresh(false);
		      if (!refreshed) {
		        setError('消息已提交到邮箱，但刷新失败；请手动刷新确认状态。');
		      }
		      if (refreshed) await refreshSent({ silent: true });
		    } catch (err) {
		      setError(`消息已提交到邮箱，但刷新失败：${err instanceof Error ? err.message : String(err)}`);
		    } finally {
		      endOperation();
		    }
		  };

		  const chooseView = (nextView) => {
		    if (operationRef.current) return;
		    setPanelView(nextView);
		    setSelected(null);
		    setThread([]);
		    setClaimReady(false);
		    setError('');
		  };

		  const openComposer = (recipient = '') => {
		    setManagementOpen(false);
		    if (operationRef.current || status?.live !== true) return;
		    if (panelView !== 'compose') setComposeReturnView(panelView);
		    if (recipient) setDraft((current) => ({ ...current, to: recipient }));
		    setPanelView('compose');
		    setError('');
		  };

		  const openRecipientDetails = async (recipient) => {
		    const id = String(recipient ?? '').trim();
		    if (!id || operationRef.current) return;
		    setRecipientInfoId(id);
		    setRecipientInfo(null);
		    setRecipientInfoError('');
		    if (status?.recipientDetails === 'upgrade-required') {
		      setRecipientInfoError('当前 Agent Mail provider 不支持收件人详情，请升级 provider 后重试。');
		      return;
		    }
		    if (!beginOperation()) return;
		    setRecipientInfoBusy(true);
		    try {
		      const details = recipientDetails(await api('agent-details', { agent_id: id }), id);
		      if (details.error) {
		        throw new Error(details.error === 'agent-identity-mismatch'
		          ? '收件人详情身份不匹配，已隐藏结果。'
		          : 'Agent Mail provider 未返回收件人身份，无法安全显示详情。');
		      }
		      setRecipientInfo(details);
		    } catch (err) {
		      setRecipientInfoError(err instanceof Error ? err.message : String(err));
		    } finally {
		      setRecipientInfoBusy(false);
		      endOperation();
		    }
		  };

		  const closeRecipientDetails = () => {
		    if (operationRef.current) return;
		    setRecipientInfoId('');
		    setRecipientInfo(null);
		    setRecipientInfoError('');
		  };

		  const openRecipientsForTest = () => {
		    if (operationRef.current) return;
		    setManagementOpen(false);
		    chooseView('recipients');
		  };

		  const refreshAfterActivation = useCallback(() => {
		    resetSentHistory();
		    void refreshAll();
		  }, [refreshAll, resetSentHistory]);

		  const refreshRecipients = async () => {
		    if (operationRef.current || refreshInFlightRef.current || status?.live !== true) return;
		    refreshInFlightRef.current = true;
		    setBusy(true);
		    setError('');
		    try {
		      const nextAgents = agentList(await api('agents'));
		      setAgents(nextAgents);
		      setLastAgentsRefresh({ at: Date.now(), ok: true });
		    } catch (err) {
		      setAgents([]);
		      setLastAgentsRefresh({ at: Date.now(), ok: false });
		      setError(`收件人读取失败：${err instanceof Error ? err.message : String(err)}。可手动重试。`);
		    } finally {
		      refreshInFlightRef.current = false;
		      setBusy(false);
		    }
		  };

		  const changeListPaneSize = (nextSize) => {
		    setListPaneSize(Math.max(MIN_LIST_PANE, Math.min(MAX_LIST_PANE, Math.round(nextSize))));
		  };

		  const beginResize = (event) => {
		    if (event.button != null && event.button !== 0) return;
		    const currentSize = listPaneSize
		      ?? listRef.current?.getBoundingClientRect?.().height
		      ?? MIN_LIST_PANE;
		    resizeRef.current = { startY: event.clientY, startSize: currentSize };
		    event.currentTarget.setPointerCapture?.(event.pointerId);
		    event.preventDefault();
		  };

		  const moveResize = (event) => {
		    const resize = resizeRef.current;
		    if (!resize) return;
		    changeListPaneSize(resize.startSize + event.clientY - resize.startY);
		  };

		  const endResize = (event) => {
		    resizeRef.current = null;
		    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
		      event.currentTarget.releasePointerCapture?.(event.pointerId);
		    }
		  };

		  const resizeWithKeyboard = (event) => {
		    const currentSize = listPaneSize
		      ?? listRef.current?.getBoundingClientRect?.().height
		      ?? MIN_LIST_PANE;
		    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
		      changeListPaneSize(currentSize - LIST_RESIZE_STEP);
		      event.preventDefault();
		    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
		      changeListPaneSize(currentSize + LIST_RESIZE_STEP);
		      event.preventDefault();
		    } else if (event.key === 'Home') {
		      changeListPaneSize(MIN_LIST_PANE);
		      event.preventDefault();
		    } else if (event.key === 'End') {
		      changeListPaneSize(MAX_LIST_PANE);
		      event.preventDefault();
		    } else if (event.key === 'Escape') {
		      setListPaneSize(null);
		      event.preventDefault();
		    }
		  };

		  if (!visible) return null;

		  const isCompose = panelView === 'compose';
		  const shownItems = panelView === 'sent' ? sentRecords : items;
		  const selectedOutcome = selected ? taskOutcome(selected, thread, terminalTaskIds) : '';
		  const selectedSubject = selected ? threadSubject(selected, thread) : '';
		  const selectedParticipants = selected ? threadParticipants(selected, thread) : [];
		  const processable = Boolean(
		    selected?.messageId
		    && panelView !== 'sent'
		    && selected.localOnly !== true
		    && selected.durable !== true
		    && selected.deliveryStatus !== 'outbound'
		    && claimReady,
		  );
		  const ackReady = processable && (canAck(selected, thread)
		    || Boolean(selected?.taskId && terminalTaskIds.has(selected.taskId)));
		  const checkCompletion = processable && selected.type === 'task' && !ackReady;
		  const listPaneStyle = listPaneSize == null
		    ? { ...listStyle, maxHeight: selected ? '42%' : 'none' }
		    : { ...listStyle, flex: '0 0 auto', height: listPaneSize, maxHeight: 'none' };

		  const renderMailbox = () => h('div', { style: contentStyle, 'data-mail-view': panelView },
		    h('nav', { style: navStyle, 'aria-label': 'Agent Mail 视图' },
		      h('button', {
		        type: 'button',
		        style: viewButtonStyle(panelView === 'inbox'),
		        'aria-pressed': panelView === 'inbox',
		        disabled: busy,
		        'data-agent-mail-action': 'mail-inbox',
		        onClick: () => chooseView('inbox'),
		      }, '收件箱'),
		      h('button', {
		        type: 'button',
		        style: viewButtonStyle(panelView === 'sent'),
		        'aria-pressed': panelView === 'sent',
		        disabled: busy,
		        'data-agent-mail-action': 'mail-sent',
		        onClick: () => chooseView('sent'),
		      }, `已发送（${sentRecords.length}）`),
		      h('button', {
		        type: 'button',
		        style: viewButtonStyle(panelView === 'recipients'),
		        'aria-pressed': panelView === 'recipients',
		        disabled: busy,
		        'data-agent-mail-action': 'mail-recipients',
		        onClick: () => chooseView('recipients'),
		      }, '收件人'),
		    ),
		    panelView === 'recipients'
		      ? h('div', { style: recipientsStyle, 'data-recipient-view': true },
		        h('div', { style: viewHeadingStyle },
		          h('div', { style: titleRowStyle },
		            h('strong', null, '收件人'),
		            h('span', { style: countStyle }, `${recipients.length} 个`),
		          ),
		          h('button', {
		            type: 'button',
		            style: buttonStyle,
		            disabled: busy || status?.live !== true,
		            'data-agent-mail-action': 'recipient-refresh',
		            onClick: () => void refreshRecipients(),
		          }, '刷新收件人'),
		        ),
		        h('div', { style: helperStyle },
		          '目录只提供 Agent Mail 返回的身份 ID；详情中的设备和连接字段由 provider 提供，列表本身不能证明客户端在线。',
		        ),
		        h('div', { style: recipientRefreshStyle },
		          `上次刷新：${formatRefreshTime(lastAgentsRefresh?.at)}`,
		        ),
		        recipients.length === 0 && h('div', { style: emptyStyle }, status?.live !== true
		          ? 'Agent Mail 未加载，暂时无法读取收件人。'
		          : lastAgentsRefresh?.ok === false
		            ? '收件人读取失败，请重试。'
		            : !selfId
		              ? '当前身份未知，暂不展示目录；请重试诊断。'
		              : '当前目录没有可用收件人。请先在 Agent Mail 中完成身份登记。'),
		        h('div', { style: recipientListStyle }, recipients.map((id) => h('div', {
		          key: id,
		          style: recipientRowContainerStyle,
		          'data-recipient-id': id,
		        },
		          h('button', {
		            type: 'button',
		            style: recipientRowStyle,
		            disabled: busy,
		            'data-recipient-compose': id,
		            onClick: () => openComposer(id),
		          },
		            h('span', { style: recipientIdStyle }, id),
		            h('span', { style: recipientStatusStyle }, '连接状态：未知'),
		            h('span', { style: recipientArrowStyle, 'aria-hidden': true }, '→'),
		          ),
		          h('button', {
		            type: 'button',
		            style: recipientDetailsButtonStyle,
		            disabled: busy,
		            'data-agent-mail-action': 'recipient-details',
		            'data-agent-mail-recipient': id,
		            onClick: () => void openRecipientDetails(id),
		          }, '查看详情'),
		        ))),
		        recipientInfoId && h('section', {
		          style: recipientDetailsStyle,
		          'data-recipient-details': recipientInfoId,
		          'aria-label': `收件人详情 ${recipientInfoId}`,
		        },
		          h('div', { style: titleRowStyle },
		            h('strong', null, '收件人详情'),
		            h('button', {
		              type: 'button',
		              style: buttonStyle,
		              disabled: busy,
		              'data-agent-mail-action': 'recipient-details-close',
		              onClick: closeRecipientDetails,
		            }, '关闭'),
		          ),
		          h('div', { style: recipientDetailIdentityStyle }, `身份 ID：${recipientInfoId}`),
		          recipientInfoBusy && h('div', { style: loadingStyle, role: 'status' }, '正在读取 provider 详情…'),
		          recipientInfoError && h('div', { style: errorStyle, role: 'alert' }, recipientInfoError),
		          recipientInfo && h('div', { style: recipientDetailGridStyle },
		            h('div', null, `设备名称：${recipientInfo.deviceName || '未知'}`),
		            h('div', null, `设备 IP：${recipientInfo.deviceIp || '未知'}`),
		            h('div', null, `Hub 地址：${recipientInfo.hubEndpoint || '未知'}`),
		            h('div', null, `连接状态：${connectionLabel(recipientInfo.connection)}`),
		            h('div', null, formatObservedTime(recipientInfo.lastSeen)),
		            h('div', null, `身份登记证据：${recipientInfo.evidence?.registration === true ? '有' : '未知'}`),
		            h('div', null, `心跳证据：${recipientInfo.evidence?.heartbeat === true ? '有' : '未知'}`),
		          ),
		        ),
		      )
		      : h('div', { style: mailboxStyle },
		        h('div', { style: viewHeadingStyle },
		          h('div', { style: titleRowStyle },
		            h('strong', null, panelView === 'sent' ? '已发送' : '收件箱'),
		            h('span', { style: countStyle }, `${shownItems.length} 条`),
		          ),
		          panelView === 'inbox' && h('label', { style: filterLabelStyle },
		            h('input', {
		              type: 'checkbox',
		              checked: unreadOnly,
		              disabled: busy,
		              onChange: (event) => setUnreadOnly(event.target.checked),
		            }),
		            '仅显示未确认收悉',
		          ),
		        ),
		        panelView === 'sent' && h('div', { style: noticeStyle },
		          sentCapability === 'unsupported'
		            ? '当前 Agent Mail provider 不支持持久发送历史，请升级 provider 后再查看。'
		            : `发送历史由 Agent Mail provider 持久保存；当前显示最近 ${SENT_HISTORY_LIMIT} 条；上次读取：${formatRefreshTime(sentLastRefresh?.at)}。`,
		        ),
		        panelView === 'sent' && sentRecords.some((item) => item.localOnly === true) && h('div', { style: warningStyle },
		          '有一条或多条本次提交记录尚未在 provider 历史中核实；它们只是面板临时记录，关闭面板后不会保留。',
		        ),
		        panelView === 'sent' && sentError && h('div', { style: errorStyle, role: 'alert' },
		          sentError,
		          h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void refreshAll() }, '重试'),
		        ),
		        panelView === 'sent' && sentPollStopped && h('div', { style: warningStyle, role: 'status' },
		          '发送状态轮询已暂停；可手动刷新继续核实。',
		        ),
		        h('div', { ref: listRef, style: listPaneStyle, 'data-mail-folder': panelView },
		          shownItems.length === 0 && h('div', { style: emptyStyle },
		            panelView === 'sent'
		              ? `最近 ${SENT_HISTORY_LIMIT} 条发送记录中暂无记录。`
		              : status?.live === true ? '暂无邮件。可发送只读任务，或让模型调用 comm_send。' : '邮箱不可用。',
		          ),
		          shownItems.map((item) => h('button', {
		            key: item.localKey || item.messageId,
		            type: 'button',
		            style: rowStyle(selected?.messageId === item.messageId && selected?.localKey === item.localKey),
		            disabled: busy,
		            'data-message-id': item.messageId,
		            onClick: () => void openThread(item),
		          },
		            h('div', { style: rowPrimaryStyle },
		              h('span', { style: typeStyle }, messageTypeLabel(item.type)),
		              h('span', { style: rowAddressStyle }, panelView === 'sent'
		                ? `至 ${item.to || '未知收件人'}`
		                : `来自 ${item.from || '未知发件人'}`),
		              h('span', { style: rowStatusStyle }, panelView === 'sent'
		                ? sentDeliveryStatusLabel(item.deliveryStatus)
		                : deliveryStatusLabel(item.deliveryStatus)),
		            ),
		            h('div', { style: snippetStyle }, item.body || '（空消息）'),
		          )),
		        ),
		        selected && h('div', {
		          role: 'separator',
		          tabIndex: 0,
		          'aria-orientation': 'horizontal',
		          'aria-label': '调整收件箱与详情高度',
		          'aria-valuemin': MIN_LIST_PANE,
		          'aria-valuemax': MAX_LIST_PANE,
		          ...(listPaneSize == null
		            ? { 'aria-valuetext': '按内容自动调整；方向键调整，Escape 恢复自动高度' }
		            : { 'aria-valuenow': listPaneSize, 'aria-valuetext': `${listPaneSize} 像素` }),
		          style: resizeHandleStyle,
		          onPointerDown: beginResize,
		          onPointerMove: moveResize,
		          onPointerUp: endResize,
		          onPointerCancel: endResize,
		          onKeyDown: resizeWithKeyboard,
		        }, '⋮'),
		        selected && h('div', { style: threadStyle },
		          h('div', { style: threadHeaderStyle },
		            h('div', { style: subjectStyle }, selectedSubject),
		            h('div', { style: participantStyle }, `参与者：${selectedParticipants.join('、') || '未知'}`),
		            h('div', { style: statusGroupStyle },
		              h('span', { style: statePillStyle }, `${selected.type === 'task' ? '任务状态' : '类型'}：${selected.type === 'task' ? taskOutcomeLabel(selectedOutcome) : messageTypeLabel(selected.type)}`),
		              h('span', { style: statePillStyle }, `投递/签收：${deliveryStatusLabel(selected.deliveryStatus)}`),
		            ),
		          ),
		          h('details', { style: detailsStyle },
		            h('summary', { style: detailsSummaryStyle }, '查看内部 ID 与投递信息'),
		            h('div', { style: detailsBodyStyle },
		              h('div', null, `message_id：${selected.messageId || '未知'}`),
		              h('div', null, `thread_id：${selected.threadId || '未知'}`),
		              h('div', null, `task_id：${selected.taskId || '未知'}`),
		              h('div', null, `效果级别：${selected.effect || '未知'}`),
		              h('div', null, '投递状态来自 Agent Mail；不表示客户端在线或客户端已读。'),
		            ),
		          ),
		          thread.map((entry, index) => h('div', { key: entry.messageId || String(index), style: messageStyle },
		            h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
		              h('span', null, `${entry.from || selected.from || '未知发件人'}${entry.to ? ` → ${entry.to}` : ''}`),
		              h('span', { style: typeStyle }, messageTypeLabel(entry.type)),
		            ),
		            h('div', { style: rowStatusStyle }, `投递/签收：${deliveryStatusLabel(entry.deliveryStatus)}`),
		            h('div', { style: { whiteSpace: 'pre-wrap' } }, entry.body),
		            entry.requiresHumanApproval && h('div', { style: noticeStyle },
		              '写入效果正在等待 human@local 审批。Harness 身份不能执行 comm_approve。',
		            ),
		          )),
		          selected.type === 'task' && processable && !ackReady && h('div', { style: noticeStyle },
		            '任务完成、报错或取消后才可以确认收悉。',
		            checkCompletion
		              && '如果任务已在其他位置完成，“检查并确认收悉”会让 Agent Mail 验证终态。',
		          ),
		          selected.type === 'task' && processable && selected.threadId && h('textarea', {
		            style: { ...inputStyle, minHeight: 56 },
		            value: doneBody,
		            placeholder: `完成说明（默认：${DEFAULT_DONE_BODY}）`,
		            onChange: (event) => setDoneBody(event.target.value),
		          }),
		          h('div', { style: actionsStyle },
		            processable && h('button', {
		              type: 'button',
		              style: buttonStyle,
		              disabled: busy || !ackReady,
		              title: !ackReady && selected.type === 'task' ? '请先发送完成、报错或取消结果' : undefined,
		              onClick: () => void runAction('ack', { message_id: selected.messageId }),
		            }, '确认收悉'),
		            processable && selected.type === 'task' && selected.threadId && selected.taskId && h('button', {
		              type: 'button',
		              style: primaryButtonStyle,
		              disabled: busy || !doneBody.trim() || ackReady,
		              title: ackReady ? '任务已有终态结果' : undefined,
		              onClick: () => void runAction('send', {
		                to: selected.from || recipients[0],
		                type: 'done',
		                body: doneBody.trim(),
		                thread_id: selected.threadId,
		                task_id: selected.taskId,
		                effect: 'read',
		              }),
		            }, '标记完成'),
		            checkCompletion && h('button', {
		              type: 'button',
		              style: buttonStyle,
		              disabled: busy,
		              title: '让 Agent Mail 验证任务终态后确认收悉',
		              onClick: () => void runAction('ack', { message_id: selected.messageId }),
		            }, '检查并确认收悉'),
		            h('button', { type: 'button', style: buttonStyle, onClick: () => quote(selected) }, '引用到对话'),
		          ),
		        ),
		      ),
		  );

		  const renderCompose = () => h('div', { style: composeStyle, 'data-mail-view': 'compose' },
		    h('div', { style: composeHeaderStyle },
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'compose-back',
		        onClick: () => {
		          if (operationRef.current) return;
		          setPanelView(composeReturnView);
		          setError('');
		        },
		      }, `返回${composeReturnView === 'recipients' ? '收件人' : composeReturnView === 'sent' ? '已发送' : '收件箱'}`),
		      h('div', { style: composeTitleStyle }, '写消息'),
		    ),
		    h('div', { style: helperStyle }, '效果级别固定为只读。提交成功只代表已写入邮箱，不代表客户端已连接、已收到通知或已读。'),
		    h('label', { style: fieldStyle },
		      h('span', null, '收件人'),
		      h('select', {
		        style: inputStyle,
		        value: draft.to,
		        disabled: busy || status?.live !== true,
		        'data-agent-mail-field': 'recipient',
		        onChange: (event) => setDraft((current) => ({ ...current, to: event.target.value })),
		      },
		        h('option', { value: '' }, '选择收件人'),
		        recipients.map((id) => h('option', { key: id, value: id }, `${id}（连接状态未知）`)),
		      ),
		    ),
		    h('label', { style: fieldStyle },
		      h('span', null, '消息类型'),
		      h('select', {
		        style: inputStyle,
		        value: draft.type,
		        disabled: busy || status?.live !== true,
		        'data-agent-mail-field': 'message-type',
		        onChange: (event) => setDraft((current) => ({ ...current, type: event.target.value })),
		      },
		        h('option', { value: 'task' }, '任务'),
		        h('option', { value: 'message' }, '消息'),
		      ),
		    ),
		    h('label', { style: fieldStyle },
		      h('span', null, '正文'),
		      h('textarea', {
		        style: { ...inputStyle, minHeight: 96, resize: 'vertical' },
		        value: draft.body,
		        disabled: busy || status?.live !== true,
		        'data-agent-mail-field': 'message-body',
		        placeholder: draft.type === 'task' ? '请输入只读任务内容' : '请输入消息内容',
		        onChange: (event) => setDraft((current) => ({ ...current, body: event.target.value })),
		      }),
		    ),
		    h('div', { style: composeFooterStyle },
		      h('span', null, '效果级别：只读'),
		      h('button', {
		        type: 'button',
		        style: primaryButtonStyle,
		        disabled: busy || !sendReady,
		        'data-agent-mail-action': 'send-mail',
		        onClick: () => void sendDraft(),
		      }, draft.type === 'task' ? '发送只读任务' : '发送消息'),
		    ),
		  );

		  const statusLabel = status === null ? (busy ? '正在连接' : '等待连接') : status.live === true ? '通信工具已加载' : '通信工具未加载';
		  const clientPresence = clientPresenceLabel(status?.clientPresence);
		  const diagnostics = diagnosticsOpen && h('div', { style: diagnosticsStyle },
		    h('div', { style: diagnosticRowStyle }, clientPresence === '未知'
		      ? '客户端连接：未知'
		      : `客户端连接：${clientPresence}`),
		    h('div', { style: diagnosticRowStyle }, `自动唤醒：${autoWakeLabel(status?.autoWake)}`),
		    h('div', { style: diagnosticRowStyle }, `签收回执：${deliveryReceiptLabel(status?.deliveryReceipts)}`),
		    h('div', { style: diagnosticRowStyle }, `通信工具：${status?.live === true ? '已加载' : '不可用'}`),
		  );

		  return h('div', { style: panelStyle, 'data-mail-view': panelView },
		    h('div', { style: headerStyle },
		      h('div', { style: headerIdentityStyle },
		        envelopeIcon(16),
		        h('div', { style: headerCopyStyle },
		          h('strong', { style: headerTitleStyle }, 'Agent Mail'),
		          h('span', { style: headerSublineStyle }, `当前身份：${selfId || '未知'}`),
		        ),
		        h('span', { style: pillStyle(status?.live === true) }, statusLabel),
		      ),
		      h('div', { style: headerActionsStyle },
		        h('button', {
		          type: 'button',
		          style: buttonStyle,
		          disabled: busy,
		          'data-agent-mail-action': 'mail-refresh',
		          onClick: () => void refreshAll(),
		        }, '手动刷新'),
		        !isCompose && h('button', {
		          type: 'button',
		          style: primaryButtonStyle,
		          disabled: busy || status?.live !== true,
		          'data-agent-mail-action': 'open-composer',
		          onClick: () => openComposer(),
		        }, '写消息'),
		      ),
		    ),
		    h('div', { style: infoBarStyle },
		      h('span', null, `当前邮箱：${selfId || '未知'}`),
		      h('span', null, `${lastRefresh?.ok ? '最后刷新' : lastRefresh ? '最近尝试' : '最后刷新'}：${formatRefreshTime(lastRefresh?.at)}`),
		    ),
		    h('div', { style: managementOpen ? { ...connectionStyle, flex: '1 1 auto', minHeight: 0, overflow: 'auto' } : connectionStyle, 'data-agent-mail-connection': true },
		      h('button', {
		        type: 'button',
		        style: connectionButtonStyle,
		        'aria-expanded': diagnosticsOpen,
		        'data-agent-mail-action': 'diagnostics',
		        onClick: () => setDiagnosticsOpen((open) => !open),
		      }, diagnosticsOpen ? '收起连接详情' : '连接详情 · 状态按需查看'),
		      diagnostics,
		      h('button', {
		        type: 'button',
		        style: connectionButtonStyle,
		        'aria-expanded': managementOpen,
		        'data-agent-mail-action': 'connection-management',
		        onClick: () => setManagementOpen((open) => !open),
		      }, managementOpen ? '收起连接管理' : '连接管理'),
		      managementOpen && h(ManagementPanel, {
		        controller: managementController,
		        snapshot: managementSnapshot,
		        onActivated: refreshAfterActivation,
		        onOpenRecipients: openRecipientsForTest,
		      }),
		    ),
		    busy && h('div', { style: loadingStyle, role: 'status' }, status === null
		      ? '正在读取 Agent Mail…'
		      : '正在处理 Agent Mail…'),
		    status && status.live !== true && h('div', { style: noticeStyle, role: 'alert' },
		      'Agent Mail MCP 未挂载。请安装 @dff652/dsh-agent-mail，设置部署环境后重启 DSH。缺少：',
		      (status.missing || []).join(', ') || 'namespace',
		    ),
		    summary?.warnings?.map((warning) => h('div', { key: warning, style: warningStyle, role: 'status' }, warning)),
		    error && h('div', { style: errorStyle, role: 'alert' },
		      h('span', null, error),
		      h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void refreshAll() }, '重试'),
		    ),
		    !managementOpen && (isCompose ? renderCompose() : renderMailbox()),
		    h('div', { style: footerStyle }, '发送只写入 Agent Mail 邮箱，不会自动唤醒客户端。'),
		  );
		}

		function ManagementPanel({ controller, snapshot, onActivated, onOpenRecipients }) {
		  const [password, setPassword] = useState('');
		  const [pairingCode, setPairingCode] = useState('');
		  const [identityConfirmed, setIdentityConfirmed] = useState(false);
		  const [clearRecoveryArmed, setClearRecoveryArmed] = useState(false);
		  const activatedGeneration = useRef(null);
		  const enrollment = snapshot.enrollment;
		  const phase = enrollment?.phase ?? '';
		  const pending = isEnrollmentPending(enrollment);
		  const busy = Boolean(snapshot.authBusy || snapshot.enrollmentBusy);
		  const profile = snapshot.profiles.find((entry) => entry.handle === snapshot.selectedProfileHandle);
		  const endpoint = snapshot.selectedEndpoint;

		  useEffect(() => {
		    if (phase !== 'pending_save') setIdentityConfirmed(false);
		  }, [phase]);

		  useEffect(() => {
		    const generation = enrollment?.generation;
		    if (phase === 'active' && generation != null && activatedGeneration.current !== generation) {
		      activatedGeneration.current = generation;
		      onActivated?.();
		    }
		  }, [enrollment?.generation, onActivated, phase]);

		  const submitLogin = async (event) => {
		    event.preventDefault();
		    const secret = password;
		    setPassword('');
		    await controller.login(secret);
		  };

		  const submitRedeem = async (event) => {
		    event.preventDefault();
		    const secret = pairingCode.trim();
		    setPairingCode('');
		    await controller.redeem(secret);
		  };

		  const submitCommit = async (event) => {
		    event.preventDefault();
		    await controller.commit(identityConfirmed);
		  };

		  const logout = async () => {
		    setPassword('');
		    setPairingCode('');
		    setIdentityConfirmed(false);
		    await controller.logout();
		  };

		  const statusLabel = {
		    checking: '正在检查管理会话',
		    unconfigured: '管理宿主未配置',
		    unauthenticated: '未登录',
		    authenticated: '已登录',
		    error: '状态未知',
		  }[snapshot.managementStatus] ?? '状态未知';

		  const header = h('div', { style: managementHeaderStyle },
		    h('div', { style: managementTitleStyle },
		      h('strong', null, '连接管理'),
		      h('span', {
		        style: pillStyle(snapshot.managementStatus === 'authenticated'),
		        'data-agent-mail-management-status': snapshot.managementStatus,
		      }, statusLabel),
		    ),
		    h('div', { style: managementHelperStyle },
		      '配对、保存和激活由受保护的管理宿主执行；普通 Agent Mail 工具不会获得这些权限。',
		    ),
		  );

		  const notices = [];
		  if (snapshot.error) {
		    notices.push(h('div', {
		      key: 'management-error',
		      role: 'alert',
		      style: errorStyle,
		      'data-agent-mail-error': 'management',
		    }, snapshot.error));
		  }
		  if (snapshot.notice) {
		    notices.push(h('div', {
		      key: 'management-notice',
		      role: 'status',
		      style: noticeStyle,
		      'data-agent-mail-notice': 'management',
		    }, snapshot.notice));
		  }

		  const clearRecoveryControls = h('div', { style: actionsStyle },
		    !clearRecoveryArmed && h('button', {
		      type: 'button',
		      style: buttonStyle,
		      disabled: busy,
		      'data-agent-mail-action': 'clear-recovery',
		      onClick: () => setClearRecoveryArmed(true),
		    }, '清除本地恢复信息'),
		    clearRecoveryArmed && h('span', { style: managementWarningStyle },
		      '这只清除浏览器恢复句柄，不会取消 Hub 上的 pending enrollment。',
		    ),
		    clearRecoveryArmed && h('button', {
		      type: 'button',
		      style: buttonStyle,
		      disabled: busy,
		      'data-agent-mail-action': 'clear-recovery-confirm',
		      onClick: () => {
		        controller.clearRecoveryMetadata();
		        setClearRecoveryArmed(false);
		      },
		    }, '确认清除恢复信息'),
		    clearRecoveryArmed && h('button', {
		      type: 'button',
		      style: buttonStyle,
		      disabled: busy,
		      'data-agent-mail-action': 'clear-recovery-cancel',
		      onClick: () => setClearRecoveryArmed(false),
		    }, '保留恢复信息'),
		  );

		  if (snapshot.managementStatus === 'checking') {
		    return h('section', {
		      style: managementPanelStyle,
		      'data-agent-mail-management': 'true',
		      'data-agent-mail-management-state': snapshot.managementStatus,
		      'aria-label': '连接管理',
		    }, header, ...notices, h('div', { style: loadingStyle, role: 'status' }, '正在检查管理宿主…'));
		  }

		  if (snapshot.managementStatus === 'unconfigured') {
		    return h('section', {
		      style: managementPanelStyle,
		      'data-agent-mail-management': 'true',
		      'data-agent-mail-management-state': snapshot.managementStatus,
		      'aria-label': '连接管理',
		    }, header, ...notices,
		    h('div', { style: emptyStyle, role: 'status' },
		      '当前 DSH 没有配置受保护的管理宿主；连接管理向导暂不可用。',
		    ));
		  }

		  if (snapshot.managementStatus !== 'authenticated' || snapshot.authenticated !== true) {
		    return h('section', {
		      style: managementPanelStyle,
		      'data-agent-mail-management': 'true',
		      'data-agent-mail-management-state': snapshot.managementStatus,
		      'aria-label': '连接管理',
		    }, header, ...notices,
		    h('form', {
		      style: managementFormStyle,
		      'data-agent-mail-form': 'login',
		      onSubmit: submitLogin,
		    },
		    h('label', { style: fieldStyle },
		      h('span', null, '管理密码'),
		      h('input', {
		        type: 'password',
		        style: inputStyle,
		        autoComplete: 'current-password',
		        value: password,
		        disabled: busy,
		        'data-agent-mail-field': 'management-password',
		        onChange: (event) => setPassword(event.target.value),
		      }),
		    ),
		    h('button', {
		      type: 'submit',
		      style: primaryButtonStyle,
		      disabled: busy || !password,
		      'data-agent-mail-action': 'login',
		    }, '登录管理宿主'),
		    ));
		  }

		  const profileOptions = snapshot.profiles.map((entry) => h('option', {
		    key: entry.handle,
		    value: entry.handle,
		  }, entry.label));
		  const endpointOptions = (profile?.endpoints ?? []).map((entry) => h('option', {
		    key: entry,
		    value: entry,
		  }, entry));
		  const profileControls = h('div', { style: managementFormStyle },
		    h('label', { style: fieldStyle },
		      h('span', null, '目标 DSH 配置'),
		      h('select', {
		        style: inputStyle,
		        value: snapshot.selectedProfileHandle,
		        disabled: busy || pending,
		        'data-agent-mail-field': 'profile',
		        onChange: (event) => controller.selectProfile(event.target.value),
		      }, profileOptions),
		    ),
		    profile && h('label', { style: fieldStyle },
		      h('span', null, 'Hub 地址'),
		      h('select', {
		        style: inputStyle,
		        value: endpoint,
		        disabled: busy || pending,
		        'data-agent-mail-field': 'endpoint',
		        onChange: (event) => controller.selectEndpoint(event.target.value),
		      }, endpointOptions),
		    ),
		    (!profile || profile.endpoints.length === 0) && h('div', { style: warningStyle, role: 'status' },
		      '当前账号没有可用的连接配置或 Hub 地址。',
		    ),
		  );

		  const sessionControls = h('div', { style: actionsStyle },
		    h('button', {
		      type: 'button',
		      style: buttonStyle,
		      disabled: busy,
		      'data-agent-mail-action': 'logout',
		      onClick: () => void logout(),
		    }, '退出管理'),
		    clearRecoveryControls,
		  );

		  const enrollmentStatus = enrollment && h('div', {
		    style: managementEnrollmentStyle,
		    'data-agent-mail-enrollment': 'true',
		    'data-agent-mail-enrollment-phase': phase,
		  },
		    h('div', { style: managementStatusRowStyle },
		      h('strong', null, '配对状态'),
		      h('span', { style: pillStyle(phase === 'active') }, enrollmentPhaseLabel(enrollment)),
		    ),
		    enrollment.profileLabel && h('div', null, `目标：${enrollment.profileLabel}`),
		    enrollment.endpoint && h('div', null, `Hub：${enrollment.endpoint}`),
		    enrollment.agentId && h('div', { 'data-agent-mail-enrollment-agent': enrollment.agentId }, `Hub 返回身份：${enrollment.agentId}`),
		    enrollment.expiresAt && h('div', null, `有效期至：${formatRefreshTime(enrollment.expiresAt)}`),
		    enrollment.error && h('div', { style: errorStyle, role: 'alert', 'data-agent-mail-error': 'enrollment' }, enrollment.error),
		  );

		  let enrollmentControls;
		  if (!enrollment || ['error', 'cancelled', 'expired'].includes(phase)) {
		    const startLabel = enrollment?.phase === 'error' ? '重新开始配对' : enrollment?.phase ? '开始新的连接' : '开始配对';
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('button', {
		        type: 'button',
		        style: primaryButtonStyle,
		        disabled: busy || !profile || !endpoint,
		        'data-agent-mail-action': 'begin-enrollment',
		        onClick: () => void controller.begin(),
		      }, startLabel),
		    );
		  } else if (phase === 'context_ready') {
		    enrollmentControls = h('form', {
		      style: managementFormStyle,
		      'data-agent-mail-form': 'redeem',
		      onSubmit: submitRedeem,
		    },
		    h('label', { style: fieldStyle },
		      h('span', null, 'Hub 配对码'),
		      h('input', {
		        type: 'password',
		        style: inputStyle,
		        autoComplete: 'one-time-code',
		        value: pairingCode,
		        disabled: busy,
		        'data-agent-mail-field': 'pairing-code',
		        onChange: (event) => setPairingCode(event.target.value),
		      }),
		    ),
		    h('div', { style: actionsStyle },
		      h('button', {
		        type: 'submit',
		        style: primaryButtonStyle,
		        disabled: busy || !pairingCode.trim(),
		        'data-agent-mail-action': 'redeem',
		      }, '验证配对码'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'cancel-enrollment',
		        onClick: () => void controller.cancel(),
		      }, '取消配对'),
		    ),
		    );
		  } else if (phase === 'pending_save') {
		    enrollmentControls = h('form', {
		      style: managementFormStyle,
		      'data-agent-mail-form': 'commit',
		      onSubmit: submitCommit,
		    },
		    h('label', { style: confirmationLabelStyle },
		      h('input', {
		        type: 'checkbox',
		        checked: identityConfirmed,
		        disabled: busy,
		        'data-agent-mail-field': 'confirm-identity',
		        onChange: (event) => setIdentityConfirmed(event.target.checked),
		      }),
		      '我确认 Hub 返回的身份与本次新连接目标一致。',
		    ),
		    h('div', { style: helperStyle }, '保存后请重启所选 DSH 配置，再检查连接是否生效。'),
		    h('div', { style: actionsStyle },
		      h('button', {
		        type: 'submit',
		        style: primaryButtonStyle,
		        disabled: busy || !identityConfirmed,
		        'data-agent-mail-action': 'commit',
		      }, '保存连接'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'cancel-enrollment',
		        onClick: () => void controller.cancel(),
		      }, '取消配对'),
		    ),
		    );
		  } else if (['beginning', 'redeeming', 'recovering', 'committing', 'activating', 'cancelling'].includes(phase)) {
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('div', { style: loadingStyle, role: 'status' }, enrollmentPhaseLabel(enrollment)),
		      !['committing', 'activating'].includes(phase) && h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'cancel-enrollment',
		        onClick: () => void controller.cancel(),
		      }, '取消配对'),
		    );
		  } else if (phase === 'unknown') {
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('div', { style: warningStyle, role: 'status' }, '结果未知；刷新状态不会再次提交配对码。'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'refresh-enrollment',
		        onClick: () => void controller.refreshEnrollment(),
		      }, '刷新状态'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'cancel-enrollment',
		        onClick: () => void controller.cancel(),
		      }, '取消配对'),
		    );
		  } else if (phase === 'saved') {
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('div', { style: enrollment.activationState === 'error' ? warningStyle : noticeStyle, role: 'status' },
		        enrollment.activationState === 'restart_required'
		          ? '连接已保存，等待 DSH 重启后检查激活。'
		          : enrollment.activationState === 'error'
		            ? '连接已保存，但激活检查未通过。'
		            : '连接已保存。',
		      ),
		      h('button', {
		        type: 'button',
		        style: primaryButtonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'activate',
		        onClick: () => void controller.activate(),
		      }, '检查激活'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'refresh-enrollment',
		        onClick: () => void controller.refreshEnrollment(),
		      }, '刷新状态'),
		    );
		  } else if (phase === 'active') {
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('div', { style: noticeStyle, role: 'status' }, '连接已激活；正在读取收件人和连接状态。'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'refresh-enrollment',
		        onClick: () => void controller.refreshEnrollment(),
		      }, '刷新状态'),
		      h('button', {
		        type: 'button',
		        style: primaryButtonStyle,
		        disabled: busy || !onOpenRecipients,
		        'data-agent-mail-action': 'open-recipients',
		        onClick: onOpenRecipients,
		      }, '查看收件人并发送只读测试任务'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy || !profile || !endpoint,
		        'data-agent-mail-action': 'begin-enrollment',
		        onClick: () => void controller.begin(),
		      }, '开始新的连接'),
		    );
		  } else if (['cleanup_pending', 'cleanup_conflict'].includes(phase)) {
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('div', { style: warningStyle, role: 'status' }, enrollmentPhaseLabel(enrollment)),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'refresh-enrollment',
		        onClick: () => void controller.refreshEnrollment(),
		      }, '刷新状态'),
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'cancel-enrollment',
		        onClick: () => void controller.cancel(),
		      }, '重试取消'),
		    );
		  } else {
		    enrollmentControls = h('div', { style: actionsStyle },
		      h('button', {
		        type: 'button',
		        style: buttonStyle,
		        disabled: busy,
		        'data-agent-mail-action': 'refresh-enrollment',
		        onClick: () => void controller.refreshEnrollment(),
		      }, '刷新状态'),
		    );
		  }

		  return h('section', {
		    style: managementPanelStyle,
		    'data-agent-mail-management': 'true',
		    'data-agent-mail-management-state': snapshot.managementStatus,
		    'aria-label': '连接管理',
		  },
		  header,
		  ...notices,
		  h('div', { style: managementSessionStyle },
		    h('div', { style: noticeStyle }, '管理会话已登录。'),
		    profileControls,
		    sessionControls,
		  ),
		  snapshot.profiles.length === 0
		    ? h('div', { style: emptyStyle, role: 'status' }, '当前管理账号没有可管理的 DSH 配置。')
		    : h('div', { style: managementEnrollmentStyle },
		      enrollmentStatus,
		      enrollmentControls,
		    ),
		  );
		}

		function ToolCard({ toolName, owner }) {
		  const model = toolCardModel(toolName, owner?.block);
		  const { kind, payload } = model;
		  if (model.state === 'running') {
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600 } }, '执行中'),
		      h('div', { style: snippetStyle }, model.callId || toolName),
		    );
		  }
		  if (model.state === 'error' || model.state === 'stopped') {
		    const action = { inbox: '读取收件箱', send: '发送', approvals: '查询审批', diagnose: '诊断' }[kind] ?? '工具调用';
		    const title = model.state === 'stopped' ? '已停止' : `${action}失败`;
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600, color: 'var(--dsh-danger, #c44)' } }, title),
		      h('div', { style: snippetStyle }, model.text || '工具返回错误'),
		    );
		  }
		  if (kind === 'inbox') {
		    const list = inboxItems(payload);
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600, marginBottom: 6 } }, `收件箱（${list.length}）`),
		      list.length === 0 && h('div', { style: emptyStyle }, '收件箱为空'),
		      list.slice(0, 8).map((item) => h('div', { key: item.messageId, style: snippetStyle },
		        `${messageTypeLabel(item.type)} ${item.from}：${item.body.slice(0, 120)}`,
		      )),
		    );
		  }
		  if (kind === 'send') {
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600 } }, '已提交到邮箱'),
		      h('div', { style: snippetStyle }, payload.id || payload.message_id || payload.thread_id || 'ok'),
		      payload.requires_human_approval === true && h('div', { style: noticeStyle },
		        '写入效果需要 human@local 审批。Harness 不能执行 comm_approve。',
		      ),
		    );
		  }
		  if (kind === 'diagnose') {
		    const summary = diagnoseSummary(payload);
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600 } }, summary.ok ? 'Agent Mail 正常' : 'Agent Mail 有警告'),
		      h('div', { style: snippetStyle }, [summary.agentId, summary.version].filter(Boolean).join(' · ')),
		    );
		  }
		  return h('div', { style: cardStyle },
		    h('div', { style: { fontWeight: 600 } }, '待人工审批'),
		    h('div', { style: snippetStyle }, JSON.stringify(payload).slice(0, 240)),
		  );
		}

		function knownAgentId(value) {
		  const id = String(value ?? '').trim();
		  if (!id) return '';
		  return ['unknown', 'unavailable', 'undefined', 'null', 'n/a'].includes(id.toLowerCase()) ? '' : id;
		}

		function isPagePollingActive() {
		  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
		  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
		  return true;
		}

		function clientPresenceLabel(value) {
		  const key = String(value ?? '').trim().toLowerCase();
		  if (key === 'online' || key === 'connected') return '在线';
		  if (key === 'offline' || key === 'disconnected') return '离线';
		  if (key === 'unavailable') return '不可用';
		  return '未知';
		}

		function autoWakeLabel(value) {
		  if (value === true || String(value ?? '').trim().toLowerCase() === 'true') return '开启';
		  if (value === false || String(value ?? '').trim().toLowerCase() === 'false') return '关闭';
		  if (['unknown', 'unavailable', ''].includes(String(value ?? '').trim().toLowerCase())) return '未知';
		  return '未知';
		}

		function deliveryReceiptLabel(value) {
		  if (value === true || ['available', 'enabled', 'supported'].includes(String(value ?? '').trim().toLowerCase())) return '可用';
		  if (value === false || ['unavailable', 'disabled', 'unsupported'].includes(String(value ?? '').trim().toLowerCase())) return '不可用';
		  return '未知';
		}

		async function api(method, payload = {}) {
		  let response;
		  try {
		    response = await fetch(`${API_PREFIX}/${method}`, {
		      method: 'POST',
		      headers: { 'content-type': 'application/json' },
		      body: JSON.stringify(payload),
		    });
		  } catch (error) {
		    throw new Error(error instanceof Error ? error.message : String(error));
		  }
		  const parsed = await response.json().catch(() => null);
		  if (!response.ok || parsed?.ok !== true) {
		    const error = new Error(parsed?.error?.message ?? `HTTP ${response.status}`);
		    error.code = parsed?.error?.code;
		    error.status = response.status;
		    throw error;
		  }
		  return parsed.value;
		}

		function sentRecord(result, payload, from) {
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

		function formatRefreshTime(value) {
		  if (!value) return '尚未刷新';
		  try {
		    const date = new Date(value);
		    if (Number.isNaN(date.valueOf())) return '未知';
		    return date.toLocaleTimeString([], {
		      hour: '2-digit',
		      minute: '2-digit',
		      second: '2-digit',
		    });
		  } catch {
		    return '未知';
		  }
		}

		function connectionLabel(value) {
		  if (value === 'connected') return '已连接（当前有证据）';
		  if (value === 'disconnected') return '已断开（当前有证据）';
		  return '未知';
		}

		function formatObservedTime(value) {
		  if (!value) return '最后观察时间：未知';
		  try {
		    const date = new Date(value);
		    if (Number.isNaN(date.valueOf())) return '最后观察时间：未知';
		    return `最后观察时间：${date.toLocaleString([], {
		      year: 'numeric',
		      month: '2-digit',
		      day: '2-digit',
		      hour: '2-digit',
		      minute: '2-digit',
		      second: '2-digit',
		    })}`;
		  } catch {
		    return '最后观察时间：未知';
		  }
		}

		function appendToDraft(ctx, sessionId, text) {
		  try {
		    const actx = ctx.sessions?.scope?.(sessionId);
		    if (actx === undefined) return false;
		    const conversation = ctx.get?.('conversation');
		    if (conversation === undefined) return false;
		    const input = conversation.input.for(actx);
		    const draft = input.state.getSnapshot().draft;
		    input.setDraft(draft.trim() === '' ? text : `${draft} ${text}`);
		    return true;
		  } catch {
		    return false;
		  }
		}

		function notifyBadge() {
		  for (const listener of unreadCache.listeners) listener();
		}

		function envelopeIcon(size) {
		  return h('svg', {
		    width: size,
		    height: size,
		    viewBox: '0 0 16 16',
		    fill: 'none',
		    xmlns: 'http://www.w3.org/2000/svg',
		  },
		    h('rect', { x: 1.5, y: 3, width: 13, height: 10, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.5 }),
		    h('path', { d: 'M2 4.5 8 9l6-4.5', stroke: 'currentColor', strokeWidth: 1.5, fill: 'none' }),
		  );
		}

		const MIN_LIST_PANE = 64;
		const MAX_LIST_PANE = 480;
		const LIST_RESIZE_STEP = 24;
		const panelStyle = {
		  display: 'flex',
		  flexDirection: 'column',
		  height: '100%',
		  minHeight: 0,
		  fontSize: 12,
		  color: 'var(--dsh-fg, CanvasText)',
		  background: 'var(--dsh-bg, Canvas)',
		};
		const headerStyle = {
		  display: 'flex',
		  flexDirection: 'column',
		  alignItems: 'stretch',
		  gap: 12,
		  padding: '12px 16px',
		  borderBottom: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
		};
		const headerIdentityStyle = { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' };
		const headerCopyStyle = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
		const headerTitleStyle = { fontSize: 15, fontWeight: 600, lineHeight: 1.2 };
		const headerSublineStyle = { fontSize: 12, opacity: 0.7, overflowWrap: 'anywhere' };
		const headerActionsStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6, width: '100%' };
		const infoBarStyle = { display: 'flex', flexWrap: 'wrap', gap: '4px 14px', padding: '8px 16px', fontSize: 12, opacity: 0.8, borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)' };
		const buttonStyle = { fontSize: 12, padding: '6px 10px', border: '1px solid color-mix(in srgb, currentColor 18%, transparent)', borderRadius: 6, background: 'transparent', color: 'inherit', cursor: 'pointer' };
		const connectionStyle = { padding: '8px 16px', borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)' };
		const connectionButtonStyle = { ...buttonStyle, border: 0, padding: '2px 0', color: 'inherit', opacity: 0.78 };
		const diagnosticsStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8, padding: 10, border: '1px solid color-mix(in srgb, currentColor 12%, transparent)', borderRadius: 6, background: 'color-mix(in srgb, currentColor 4%, transparent)' };
		const diagnosticRowStyle = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, fontSize: 12 };
		const contentStyle = { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 };
		const navStyle = { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '10px 16px 0', borderBottom: '1px solid color-mix(in srgb, currentColor 12%, transparent)' };
		const helperStyle = { padding: '8px 0', fontSize: 12, lineHeight: 1.45, opacity: 0.78 };
		const viewHeadingStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingBottom: 12 };
		const titleRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0, fontSize: 14 };
		const countStyle = { padding: '2px 7px', borderRadius: 999, background: 'color-mix(in srgb, currentColor 10%, transparent)', fontSize: 12, fontVariantNumeric: 'tabular-nums' };
		const mailboxStyle = { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, padding: '14px 16px 16px' };
		const recipientsStyle = { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, padding: '14px 16px 16px' };
		const recipientListStyle = { display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflow: 'auto' };
		const recipientRowContainerStyle = { display: 'flex', alignItems: 'stretch', gap: 6, width: '100%' };
		const recipientRowStyle = { ...buttonStyle, display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', borderColor: 'color-mix(in srgb, currentColor 12%, transparent)' };
		const recipientDetailsButtonStyle = { ...buttonStyle, flex: '0 0 auto', alignSelf: 'center', whiteSpace: 'nowrap' };
		const recipientIdStyle = { flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', fontWeight: 500 };
		const recipientStatusStyle = { flex: '0 0 auto', color: 'inherit', opacity: 0.7, fontSize: 12 };
		const recipientArrowStyle = { flex: '0 0 auto', opacity: 0.6 };
		const recipientRefreshStyle = { marginBottom: 10, fontSize: 12, opacity: 0.7 };
		const recipientDetailsStyle = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, padding: 10, border: '1px solid color-mix(in srgb, currentColor 14%, transparent)', borderRadius: 6 };
		const recipientDetailIdentityStyle = { fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' };
		const recipientDetailGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, fontSize: 12, lineHeight: 1.4, overflowWrap: 'anywhere' };
		const listStyle = { overflow: 'auto', flex: '0 1 auto', minHeight: 0 };
		const threadStyle = { overflow: 'auto', flex: '1 1 0', minHeight: 0, borderTop: '1px solid color-mix(in srgb, currentColor 16%, transparent)', padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 10 };
		const composeStyle = { display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '14px 16px 16px' };
		const composeHeaderStyle = { display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 };
		const composeFooterStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 4 };
		const composeTitleStyle = { fontSize: 15, fontWeight: 600 };
		const primaryButtonStyle = { ...buttonStyle, borderColor: 'transparent', background: 'var(--dsh-info, light-dark(#2563eb, #1d4ed8))', color: '#fff', fontWeight: 600 };
		const inputStyle = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '8px 10px', border: '1px solid color-mix(in srgb, currentColor 18%, transparent)', borderRadius: 6, background: 'var(--dsh-bg, Canvas)', color: 'var(--dsh-fg, CanvasText)' };
		const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 };
		const emptyStyle = { padding: '14px 0', fontSize: 12, opacity: 0.72 };
		const snippetStyle = { fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
		const typeStyle = { flex: '0 0 auto', fontSize: 12, opacity: 0.78, fontWeight: 600 };
		const filterLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 };
		const rowPrimaryStyle = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };
		const rowAddressStyle = { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
		const rowStatusStyle = { flex: '0 0 auto', fontSize: 12, opacity: 0.72 };
		const messageStyle = { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)' };
		const cardStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 };
		const noticeStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 12, opacity: 0.88 };
		const warningStyle = { ...noticeStyle, color: 'var(--dsh-warning, currentColor)', background: 'color-mix(in srgb, currentColor 5%, transparent)' };
		const loadingStyle = { ...noticeStyle, opacity: 0.72 };
		const errorStyle = { ...noticeStyle, color: 'var(--dsh-danger, currentColor)', background: 'color-mix(in srgb, currentColor 6%, transparent)' };
		const footerStyle = { padding: '8px 16px', borderTop: '1px solid color-mix(in srgb, currentColor 10%, transparent)', fontSize: 12, opacity: 0.68 };
		const managementPanelStyle = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, padding: '10px 0 2px', borderTop: '1px solid color-mix(in srgb, currentColor 10%, transparent)' };
		const managementHeaderStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
		const managementTitleStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14 };
		const managementHelperStyle = { fontSize: 12, lineHeight: 1.45, opacity: 0.78 };
		const managementFormStyle = { display: 'flex', flexDirection: 'column', gap: 8 };
		const managementSessionStyle = { display: 'flex', flexDirection: 'column', gap: 8 };
		const managementEnrollmentStyle = { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 0', borderTop: '1px solid color-mix(in srgb, currentColor 10%, transparent)' };
		const managementStatusRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
		const managementWarningStyle = { fontSize: 12, lineHeight: 1.45, color: 'var(--dsh-warning, currentColor)' };
		const confirmationLabelStyle = { display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, lineHeight: 1.45 };
		const threadHeaderStyle = { display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 4 };
		const subjectStyle = { fontSize: 15, fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' };
		const participantStyle = { fontSize: 12, opacity: 0.78, overflowWrap: 'anywhere' };
		const statusGroupStyle = { display: 'flex', flexWrap: 'wrap', gap: 6 };
		const statePillStyle = { display: 'inline-flex', padding: '4px 8px', borderRadius: 999, fontSize: 12, background: 'color-mix(in srgb, currentColor 8%, transparent)', overflowWrap: 'anywhere' };
		const detailsStyle = { fontSize: 12, opacity: 0.82 };
		const detailsSummaryStyle = { cursor: 'pointer', userSelect: 'none' };
		const detailsBodyStyle = { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', overflowWrap: 'anywhere' };
		const actionsStyle = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', paddingTop: 4 };
		const resizeHandleStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 10, flex: '0 0 10px', padding: 0, border: 0, background: 'color-mix(in srgb, currentColor 8%, transparent)', color: 'inherit', cursor: 'row-resize', touchAction: 'none', userSelect: 'none', fontSize: 12, lineHeight: 1 };
		const fabStyle = {
		  position: 'fixed',
		  right: 16,
		  bottom: 16,
		  zIndex: 2147483000,
		  display: 'flex',
		  alignItems: 'center',
		  gap: 6,
		  fontSize: 12,
		  padding: '8px 12px',
		};
		const drawerStyle = {
		  position: 'fixed',
		  right: 16,
		  bottom: 56,
		  width: 'min(360px, calc(100vw - 32px))',
		  height: '70vh',
		  zIndex: 2147483000,
		  overflow: 'hidden',
		  display: 'flex',
		  flexDirection: 'column',
		  background: 'var(--dsh-bg, Canvas)',
		  color: 'var(--dsh-fg, CanvasText)',
		  border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
		  boxShadow: '0 8px 24px color-mix(in srgb, currentColor 20%, transparent)',
		};

		function pillStyle(live) {
		  return {
		    fontSize: 12,
		    padding: '1px 6px',
		    borderRadius: 999,
		    opacity: live ? 1 : 0.7,
		    border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
		  };
		}

		function rowStyle(active) {
		  return {
		    display: 'block',
		    width: '100%',
		    textAlign: 'left',
		    padding: '8px 10px',
		    border: 'none',
		    background: active ? 'color-mix(in srgb, currentColor 10%, transparent)' : 'transparent',
		    cursor: 'pointer',
		  };
		}

		function viewButtonStyle(active) {
		  return {
		    ...buttonStyle,
		    borderColor: active
		      ? 'color-mix(in srgb, currentColor 34%, transparent)'
		      : 'transparent',
		    borderBottomColor: active
		      ? 'var(--dsh-info, currentColor)'
		      : 'transparent',
		    borderBottomWidth: 2,
		    borderRadius: '6px 6px 0 0',
		    fontWeight: active ? 600 : 400,
		    opacity: active ? 1 : 0.78,
		  };
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
