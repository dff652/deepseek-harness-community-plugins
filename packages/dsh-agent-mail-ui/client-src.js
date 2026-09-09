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
  deliveryStatusLabel,
  diagnoseSummary,
  messageTypeLabel,
  inboxItems,
  publicToolName,
  quoteComposerText,
  sessionScope,
  taskOutcome,
  taskOutcomeLabel,
  threadParticipants,
  threadSubject,
  threadMessages,
  toolCardModel,
  unreadBadge,
} from './view.js';
import {
  enrollmentPhaseLabel,
  getManagementController,
  isEnrollmentPending,
} from './management-view.js';

// Sessions is a core DSH client service, independent of Agent Mail MCP.
export const inject = ['sessions'];

const CARD_TOOLS = [
  publicToolName('comm_inbox'),
  publicToolName('comm_send'),
  publicToolName('comm_approvals'),
  publicToolName('comm_diagnose'),
];

const unreadCache = { count: null, listeners: new Set() };
let localSentSequence = 0;

export function apply(ctx) {
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
  selectedRef.current = selected;

  const summary = useMemo(() => (diagnose ? diagnoseSummary(diagnose) : null), [diagnose]);
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

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

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
      if (item.messageId && item.deliveryStatus !== 'outbound' && item.deliveryStatus !== 'acked') {
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

  const openRecipientsForTest = () => {
    if (operationRef.current) return;
    setManagementOpen(false);
    chooseView('recipients');
  };

  const refreshAfterActivation = useCallback(() => {
    void refresh();
  }, [refresh]);

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
  const processable = Boolean(selected?.messageId && selected.deliveryStatus !== 'outbound' && claimReady);
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
      }, `已发送（本次面板：${sentRecords.length}）`),
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
          '目录只提供 Agent Mail 返回的身份 ID；列表不能证明客户端在线，也不表示物理位置。',
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
        h('div', { style: recipientListStyle }, recipients.map((id) => h('button', {
          key: id,
          type: 'button',
          style: recipientRowStyle,
          disabled: busy,
          'data-recipient-id': id,
          onClick: () => openComposer(id),
        },
          h('span', { style: recipientIdStyle }, id),
          h('span', { style: recipientStatusStyle }, '连接状态：未知'),
          h('span', { style: recipientArrowStyle, 'aria-hidden': true }, '→'),
        ))),
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
          '仅显示本次面板打开期间的本地发送记录；Agent Mail 当前没有全局已发送历史或签收回执，关闭面板后记录会清空。',
        ),
        h('div', { ref: listRef, style: listPaneStyle, 'data-mail-folder': panelView },
          shownItems.length === 0 && h('div', { style: emptyStyle },
            panelView === 'sent'
              ? '本次面板还没有发送记录。'
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
                ? deliveryStatusLabel('outbound')
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
          onClick: () => void refresh(),
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
      h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void refresh() }, '重试'),
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
    throw new Error(parsed?.error?.message ?? `HTTP ${response.status}`);
  }
  return parsed.value;
}

function sentRecord(result, payload, from) {
  const value = result != null && typeof result === 'object' ? result : {};
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
    deliveryStatus: 'outbound',
    unread: false,
    claimed: false,
    localOnly: true,
  };
}

function formatRefreshTime(value) {
  if (!value) return '尚未刷新';
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '未知';
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
const recipientRowStyle = { ...buttonStyle, display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', borderColor: 'color-mix(in srgb, currentColor 12%, transparent)' };
const recipientIdStyle = { flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', fontWeight: 500 };
const recipientStatusStyle = { flex: '0 0 auto', color: 'inherit', opacity: 0.7, fontSize: 12 };
const recipientArrowStyle = { flex: '0 0 auto', opacity: 0.6 };
const recipientRefreshStyle = { marginBottom: 10, fontSize: 12, opacity: 0.7 };
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
