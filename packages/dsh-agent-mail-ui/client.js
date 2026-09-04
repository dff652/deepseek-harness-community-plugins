window.__ModuleLoader__.load({
	id: '@dff652/dsh-agent-mail-ui',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const { createElement: h, useCallback, useEffect, useMemo, useRef, useState } = require('react');
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
		];

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

		function inboxItems(payload) {
		  const items = Array.isArray(payload?.items) ? payload.items : [];
		  return items.map((item) => ({
		    messageId: String(item.message_id ?? item.id ?? ''),
		    threadId: item.thread_id == null ? '' : String(item.thread_id),
		    taskId: item.task_id == null ? '' : String(item.task_id),
		    type: String(item.type ?? 'message'),
		    from: String(item.from ?? item.sender ?? ''),
		    to: String(item.to ?? ''),
		    body: String(item.body_md ?? item.body ?? item.text ?? ''),
		    effect: String(item.effect ?? 'read'),
		    unread: item.unread !== false,
		    claimed: item.status === 'claimed' || item.claimed === true,
		    requiresHumanApproval: item.requires_human_approval === true,
		  })).filter((item) => item.messageId !== '');
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
		    body: String(item.body_md ?? item.body ?? item.text ?? ''),
		    effect: String(item.effect ?? 'read'),
		    requiresHumanApproval: item.requires_human_approval === true,
		  }));
		}

		function diagnoseSummary(payload) {
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
		  if (Array.isArray(payload?.agents)) return payload.agents.map(String);
		  if (Array.isArray(payload)) return payload.map(String);
		  return [];
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
		const inject = [];

		const CARD_TOOLS = [
		  publicToolName('comm_inbox'),
		  publicToolName('comm_send'),
		  publicToolName('comm_approvals'),
		  publicToolName('comm_diagnose'),
		];

		const unreadCache = { count: null, listeners: new Set() };

		function apply(ctx) {
		  ctx.effect(() => bindSurfaces(ctx));
		  const slots = ctx.get?.('slots');
		  if (!slots?.inject) return;
		  for (const toolName of CARD_TOOLS) {
		    try {
		      slots.inject('tool.call.toolview', () => slots.register(
		        { name: 'tool.call.toolview', key: toolName },
		        (props) => h(ToolCard, { toolName, props }),
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
		      'With better-sidebar: open the right panel, then + → Agent Mail. Without it: use the mail button at the bottom-right.',
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
		  return h('div', null,
		    h('button', {
		      type: 'button',
		      style: fabStyle,
		      title: 'Agent Mail',
		      onClick: () => setOpen((value) => !value),
		    }, envelopeIcon(16), ' Mail'),
		    open && h('div', { style: drawerStyle },
		      h(MailPanel, { pluginCtx: ctx, ctx, scope: currentScope(ctx), visible: true }),
		    ),
		  );
		}

		function currentScope(ctx) {
		  try {
		    const snap = ctx.sessions?.list?.getSnapshot?.();
		    const first = Array.isArray(snap) ? snap[0] : snap?.items?.[0];
		    const sessionId = first?.id ?? first?.sessionId;
		    return sessionId ? { sessionId } : {};
		  } catch {
		    return {};
		  }
		}

		function MailPanel({ pluginCtx, ctx, scope, visible }) {
		  const host = pluginCtx ?? ctx;
		  const [status, setStatus] = useState(null);
		  const [diagnose, setDiagnose] = useState(null);
		  const [items, setItems] = useState([]);
		  const [agents, setAgents] = useState([]);
		  const [unreadOnly, setUnreadOnly] = useState(true);
		  const [selected, setSelected] = useState(null);
		  const [thread, setThread] = useState([]);
		  const [error, setError] = useState('');
		  const [composeOpen, setComposeOpen] = useState(false);
		  const [draft, setDraft] = useState({ to: '', body: '', type: 'task' });
		  const [busy, setBusy] = useState(false);
		  const visibleRef = useRef(visible);
		  visibleRef.current = visible;

		  const summary = useMemo(() => (diagnose ? diagnoseSummary(diagnose) : null), [diagnose]);

		  const refresh = useCallback(async () => {
		    setBusy(true);
		    setError('');
		    try {
		      const nextStatus = await api('status');
		      setStatus(nextStatus);
		      if (!nextStatus.live) {
		        setItems([]);
		        setThread([]);
		        unreadCache.count = null;
		        notifyBadge();
		        return;
		      }
		      const [nextDiagnose, nextInbox, nextAgents] = await Promise.all([
		        api('diagnose'),
		        api('inbox', { unread_only: unreadOnly }),
		        api('agents'),
		      ]);
		      const list = inboxItems(nextInbox);
		      setDiagnose(nextDiagnose);
		      setItems(list);
		      setAgents(agentList(nextAgents));
		      unreadCache.count = unreadOnly ? list.length : unreadBadge(list);
		      notifyBadge();
		    } catch (err) {
		      setError(err instanceof Error ? err.message : String(err));
		    } finally {
		      setBusy(false);
		    }
		  }, [unreadOnly]);

		  useEffect(() => {
		    if (visible) void refresh();
		  }, [visible, refresh]);

		  const openThread = async (item) => {
		    setSelected(item);
		    setBusy(true);
		    setError('');
		    try {
		      if (item.messageId) {
		        try {
		          await api('claim', { message_id: item.messageId });
		        } catch {
		          // already claimed is not fatal
		        }
		      }
		      if (item.threadId) {
		        const tailed = await api('tail', { thread_id: item.threadId });
		        setThread(threadMessages(tailed));
		      } else {
		        setThread([item]);
		      }
		    } catch (err) {
		      setError(err instanceof Error ? err.message : String(err));
		    } finally {
		      setBusy(false);
		    }
		  };

		  const runAction = async (method, payload) => {
		    setBusy(true);
		    setError('');
		    try {
		      await api(method, payload);
		      await refresh();
		      if (selected?.threadId) {
		        const tailed = await api('tail', { thread_id: selected.threadId });
		        setThread(threadMessages(tailed));
		      }
		    } catch (err) {
		      setError(err instanceof Error ? err.message : String(err));
		    } finally {
		      setBusy(false);
		    }
		  };

		  const quote = (item) => {
		    const sessionId = scope?.sessionId;
		    if (!sessionId || !appendToDraft(host, sessionId, quoteComposerText(item))) {
		      setError('Could not insert into the composer');
		    }
		  };

		  const sendDraft = async () => {
		    setBusy(true);
		    setError('');
		    try {
		      const sent = await api('send', { ...draft, effect: 'read' });
		      setComposeOpen(false);
		      setDraft({ to: '', body: '', type: 'task' });
		      await refresh();
		      const created = {
		        messageId: String(sent.id ?? sent.message_id ?? ''),
		        threadId: String(sent.thread_id ?? ''),
		        taskId: String(sent.task_id ?? ''),
		        type: String(sent.type ?? draft.type),
		        from: summary?.agentId ?? '',
		        body: draft.body,
		        effect: 'read',
		      };
		      if (created.threadId || created.messageId) await openThread(created);
		    } catch (err) {
		      setError(err instanceof Error ? err.message : String(err));
		    } finally {
		      setBusy(false);
		    }
		  };

		  if (!visible) return null;

		  const selfId = summary?.agentId ?? '';
		  const recipients = agents.filter((id) => id && id !== selfId && id !== 'human@local');

		  return h('div', { style: panelStyle },
		    h('div', { style: headerStyle },
		      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
		        envelopeIcon(14),
		        h('strong', { style: { fontSize: 12 } }, 'Agent Mail'),
		        h('span', { style: pillStyle(status?.live) }, status?.live ? (selfId || 'live') : 'offline'),
		      ),
		      h('div', { style: { display: 'flex', gap: 6 } },
		        h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void refresh() }, 'Refresh'),
		        h('button', { type: 'button', style: buttonStyle, onClick: () => setComposeOpen((open) => !open) }, 'New'),
		      ),
		    ),
		    status && !status.live && h('div', { style: noticeStyle },
		      'Agent Mail MCP is not mounted. Install @dff652/dsh-agent-mail, set the deployment environment, and restart DSH. Missing: ',
		      (status.missing || []).join(', ') || 'namespace',
		    ),
		    summary?.warnings?.length > 0 && h('div', { style: noticeStyle }, summary.warnings.join(' / ')),
		    error && h('div', { style: errorStyle }, error),
		    composeOpen && h('div', { style: composeStyle },
		      h('select', {
		        style: inputStyle,
		        value: draft.to,
		        onChange: (event) => setDraft((current) => ({ ...current, to: event.target.value })),
		      },
		        h('option', { value: '' }, 'Recipient'),
		        recipients.map((id) => h('option', { key: id, value: id }, id)),
		      ),
		      h('select', {
		        style: inputStyle,
		        value: draft.type,
		        onChange: (event) => setDraft((current) => ({ ...current, type: event.target.value })),
		      },
		        h('option', { value: 'task' }, 'task'),
		        h('option', { value: 'message' }, 'message'),
		      ),
		      h('textarea', {
		        style: { ...inputStyle, minHeight: 72 },
		        value: draft.body,
		        placeholder: 'Read-only task body',
		        onChange: (event) => setDraft((current) => ({ ...current, body: event.target.value })),
		      }),
		      h('button', { type: 'button', style: buttonStyle, disabled: busy || !draft.to || !draft.body, onClick: () => void sendDraft() }, 'Send read task'),
		    ),
		    h('div', { style: toolbarStyle },
		      h('label', { style: { fontSize: 12 } },
		        h('input', {
		          type: 'checkbox',
		          checked: unreadOnly,
		          onChange: (event) => setUnreadOnly(event.target.checked),
		        }),
		        ' Unread only',
		      ),
		      h('span', { style: { fontSize: 11, opacity: 0.7 } }, `${items.length} shown`),
		    ),
		    h('div', { style: listStyle },
		      items.length === 0 && h('div', { style: emptyStyle },
		        status?.live ? 'No mail yet. Send a read-only task or ask the model to comm_send.' : 'Mailbox unavailable.',
		      ),
		      items.map((item) => h('button', {
		        key: item.messageId,
		        type: 'button',
		        style: rowStyle(selected?.messageId === item.messageId),
		        onClick: () => void openThread(item),
		      },
		        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
		          h('span', { style: typeStyle }, item.type),
		          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.from || '(unknown)'),
		        ),
		        h('div', { style: snippetStyle }, item.body || '(empty)'),
		      )),
		    ),
		    selected && h('div', { style: threadStyle },
		      h('div', { style: { fontSize: 12, fontWeight: 600 } }, selected.threadId || selected.messageId),
		      thread.map((entry, index) => h('div', { key: entry.messageId || String(index), style: messageStyle },
		        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
		          h('span', null, entry.from || selected.from),
		          h('span', { style: typeStyle }, entry.type),
		        ),
		        h('div', { style: { whiteSpace: 'pre-wrap' } }, entry.body),
		        entry.requiresHumanApproval && h('div', { style: noticeStyle },
		          'Write effect waiting for human@local. This Harness identity cannot approve.',
		        ),
		      )),
		      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
		        selected.messageId && h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void runAction('ack', { message_id: selected.messageId }) }, 'Ack'),
		        selected.threadId && h('button', {
		          type: 'button',
		          style: buttonStyle,
		          disabled: busy || !draft.body,
		          onClick: () => void runAction('send', {
		            to: selected.from || recipients[0],
		            type: 'done',
		            body: draft.body || 'done',
		            thread_id: selected.threadId,
		            task_id: selected.taskId,
		            effect: 'read',
		          }),
		        }, 'Done'),
		        h('button', { type: 'button', style: buttonStyle, onClick: () => quote(selected) }, 'Quote to chat'),
		      ),
		    ),
		  );
		}

		function ToolCard({ toolName, props }) {
		  const kind = toolCardKind(toolName);
		  const payload = parseResult(props);
		  if (kind === 'inbox') {
		    const list = inboxItems(payload);
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600, marginBottom: 6 } }, `Inbox (${list.length})`),
		      list.length === 0 && h('div', { style: emptyStyle }, 'Empty inbox'),
		      list.slice(0, 8).map((item) => h('div', { key: item.messageId, style: snippetStyle },
		        `${item.type} ${item.from}: ${item.body.slice(0, 120)}`,
		      )),
		    );
		  }
		  if (kind === 'send') {
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600 } }, 'Sent'),
		      h('div', { style: snippetStyle }, payload.id || payload.message_id || payload.thread_id || 'ok'),
		      payload.requires_human_approval === true && h('div', { style: noticeStyle },
		        'Write effect needs human@local approval. Harness cannot comm_approve.',
		      ),
		    );
		  }
		  if (kind === 'diagnose') {
		    const summary = diagnoseSummary(payload);
		    return h('div', { style: cardStyle },
		      h('div', { style: { fontWeight: 600 } }, summary.ok ? 'Agent Mail healthy' : 'Agent Mail warning'),
		      h('div', { style: snippetStyle }, [summary.agentId, summary.version].filter(Boolean).join(' · ')),
		    );
		  }
		  return h('div', { style: cardStyle },
		    h('div', { style: { fontWeight: 600 } }, 'Approvals'),
		    h('div', { style: snippetStyle }, JSON.stringify(payload).slice(0, 240)),
		  );
		}

		function parseResult(props) {
		  const value = props?.result ?? props?.value ?? props?.output ?? props;
		  if (value && typeof value === 'object' && value.structuredContent) return value.structuredContent;
		  return value && typeof value === 'object' ? value : {};
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
		    throw new Error(parsed?.error?.message ?? `HTTP ${response.status}`);
		  }
		  return parsed.value;
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

		const panelStyle = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: 12 };
		const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderBottom: '1px solid color-mix(in srgb, currentColor 16%, transparent)' };
		const toolbarStyle = { display: 'flex', justifyContent: 'space-between', padding: '6px 10px' };
		const listStyle = { overflow: 'auto', flex: '1 1 40%', minHeight: 80 };
		const threadStyle = { overflow: 'auto', flex: '1 1 45%', minHeight: 80, borderTop: '1px solid color-mix(in srgb, currentColor 16%, transparent)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 };
		const composeStyle = { display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderBottom: '1px solid color-mix(in srgb, currentColor 16%, transparent)' };
		const buttonStyle = { fontSize: 11, padding: '4px 8px' };
		const inputStyle = { fontSize: 12, padding: 6 };
		const emptyStyle = { padding: 12, opacity: 0.7 };
		const snippetStyle = { opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
		const typeStyle = { fontSize: 10, opacity: 0.7, textTransform: 'uppercase' };
		const messageStyle = { display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0', borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)' };
		const cardStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 };
		const noticeStyle = { padding: '8px 10px', fontSize: 11, opacity: 0.85 };
		const errorStyle = { padding: '8px 10px', color: 'var(--dsh-danger, #c44)' };
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
		  width: 360,
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
		    fontSize: 10,
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
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
