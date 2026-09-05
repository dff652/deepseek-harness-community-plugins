import {
  createElement as h,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  API_PREFIX,
  DEFAULT_DONE_BODY,
  TAB_ID,
  agentList,
  canAck,
  diagnoseSummary,
  inboxItems,
  publicToolName,
  quoteComposerText,
  sessionScope,
  threadMessages,
  toolCardModel,
  unreadBadge,
} from './view.js';

// Sessions is a core DSH client service, independent of Agent Mail MCP.
export const inject = ['sessions'];

const CARD_TOOLS = [
  publicToolName('comm_inbox'),
  publicToolName('comm_send'),
  publicToolName('comm_approvals'),
  publicToolName('comm_diagnose'),
];

const unreadCache = { count: null, listeners: new Set() };

export function apply(ctx) {
  ctx.effect(() => bindSurfaces(ctx));
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
  const scope = useCurrentScope(ctx, open);
  return h('div', null,
    h('button', {
      type: 'button',
      style: fabStyle,
      title: 'Agent Mail',
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
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [error, setError] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState({ to: '', body: '', type: 'task' });
  const [doneBody, setDoneBody] = useState(DEFAULT_DONE_BODY);
  const [terminalTaskIds, setTerminalTaskIds] = useState(() => new Set());
  const [claimReady, setClaimReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const summary = useMemo(() => (diagnose ? diagnoseSummary(diagnose) : null), [diagnose]);

  const refresh = useCallback(async (manageBusy = true) => {
    if (manageBusy) setBusy(true);
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
      unreadCache.count = unreadBadge(list);
      notifyBadge();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (manageBusy) setBusy(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const openThread = async (item) => {
    if (item.messageId !== selected?.messageId) setDoneBody(DEFAULT_DONE_BODY);
    setSelected(item);
    setThread([]);
    setClaimReady(false);
    setBusy(true);
    setError('');
    try {
      if (item.messageId && item.deliveryStatus !== 'outbound' && item.deliveryStatus !== 'acked') {
        await api('claim', { message_id: item.messageId });
        setClaimReady(true);
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
      if (
        method === 'send'
        && payload.task_id
        && ['done', 'error', 'cancel'].includes(payload.type)
      ) {
        setTerminalTaskIds((current) => new Set(current).add(payload.task_id));
      }
      if (method === 'ack') {
        setClaimReady(false);
        setSelected((current) => current ? { ...current, deliveryStatus: 'acked' } : current);
      }
      await refresh(false);
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
    const text = quoteComposerText(item);
    // Tab props.ctx is the sidebar fiber (sessions + conversation). pluginCtx
    // is this package's own fiber and does not see those services.
    if (!sessionId || !(appendToDraft(ctx, sessionId, text) || appendToDraft(pluginCtx, sessionId, text))) {
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
      await refresh(false);
      const created = {
        messageId: String(sent.id ?? sent.message_id ?? ''),
        threadId: String(sent.thread_id ?? ''),
        taskId: String(sent.task_id ?? ''),
        type: String(sent.type ?? draft.type),
        from: summary?.agentId ?? '',
        body: draft.body,
        effect: 'read',
        deliveryStatus: 'outbound',
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
  const processable = Boolean(selected?.messageId && selected.deliveryStatus !== 'outbound' && claimReady);
  const ackReady = processable && (canAck(selected, thread)
    || Boolean(selected?.taskId && terminalTaskIds.has(selected.taskId)));
  const checkCompletion = processable && selected.type === 'task' && !ackReady;

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
          disabled: busy,
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
        disabled: busy,
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
      selected.type === 'task' && processable && !ackReady && h('div', { style: noticeStyle },
        'Ack is available after Done, Error, or Cancel completes the task. ',
        checkCompletion
          && 'For tasks completed elsewhere, Check & Ack asks Agent Mail to validate completion and acknowledge delivery.',
      ),
      selected.type === 'task' && processable && selected.threadId && h('textarea', {
        style: { ...inputStyle, minHeight: 56 },
        value: doneBody,
        placeholder: `Completion summary (default: ${DEFAULT_DONE_BODY})`,
        onChange: (event) => setDoneBody(event.target.value),
      }),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
        processable && h('button', {
          type: 'button',
          style: buttonStyle,
          disabled: busy || !ackReady,
          title: !ackReady && selected.type === 'task' ? 'Send Done, Error, or Cancel before Ack' : undefined,
          onClick: () => void runAction('ack', { message_id: selected.messageId }),
        }, 'Ack'),
        processable && selected.type === 'task' && selected.threadId && selected.taskId && h('button', {
          type: 'button',
          style: buttonStyle,
          disabled: busy || !doneBody.trim() || ackReady,
          title: ackReady ? 'Task already has a terminal outcome' : undefined,
          onClick: () => void runAction('send', {
            to: selected.from || recipients[0],
            type: 'done',
            body: doneBody.trim(),
            thread_id: selected.threadId,
            task_id: selected.taskId,
            effect: 'read',
          }),
        }, 'Done'),
        checkCompletion && h('button', {
          type: 'button',
          style: buttonStyle,
          disabled: busy,
          title: 'Ask Agent Mail to validate the task before acknowledging it',
          onClick: () => void runAction('ack', { message_id: selected.messageId }),
        }, 'Check & Ack'),
        h('button', { type: 'button', style: buttonStyle, onClick: () => quote(selected) }, 'Quote to chat'),
      ),
    ),
  );
}

function ToolCard({ toolName, owner }) {
  const model = toolCardModel(toolName, owner?.block);
  const { kind, payload } = model;
  if (model.state === 'running') {
    return h('div', { style: cardStyle },
      h('div', { style: { fontWeight: 600 } }, 'Running'),
      h('div', { style: snippetStyle }, model.callId || toolName),
    );
  }
  if (model.state === 'error' || model.state === 'stopped') {
    const title = model.state === 'stopped' ? 'Stopped' : `${kind[0].toUpperCase()}${kind.slice(1)} failed`;
    return h('div', { style: cardStyle },
      h('div', { style: { fontWeight: 600, color: 'var(--dsh-danger, #c44)' } }, title),
      h('div', { style: snippetStyle }, model.text || 'Tool returned an error'),
    );
  }
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
