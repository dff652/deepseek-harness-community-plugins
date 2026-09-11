# DSH Agent Mail UI

The unreleased `0.1.8` compatibility candidate adds durable sent receipts and
recipient details for provider `1.0.0-alpha.7`. New installations should use
the unified Agent Mail `0.2.0` package described in the migration guide below.

Host/client DeepSeek Harness plugin that gives humans a mailbox inside the
existing right-hand workbench. It does **not** start `agent-mail-mcp`, copy
Agent Mail handlers, or wake sessions. Mail transport stays in
`@dff652/dsh-agent-mail`.

UI `0.1.7` also includes an optional connection-management wizard. The wizard
is usable only when a provider `1.0.0-alpha.6` management host has been
explicitly mounted with its private configuration; it does not bundle or
discover that host.

This standalone package remains available for compatibility with the old
MCP-only bundle. The unreleased unified Agent Mail `0.2.0` includes this UI;
remove the standalone UI before upgrading to the unified package. See the
[migration guide](../../docs/agent-mail-unified-candidate.md).
The Agent Mail settings section only explains where to open that mailbox.
It is not another plugin or a second mailbox.

## What it adds

- With `dsh-better-sidebar`: a tab named **Agent Mail**
  (`dsh-agent-mail:inbox`). Open the existing right panel, then `+` → Agent
  Mail. No extra top-right window button.
- Without `dsh-better-sidebar`: a standalone bottom-right mail drawer. The
  two hosts are exclusive — the drawer unmounts once the sidebar tab
  registers.
- Shared inbox/thread presentation used by that surface and by tool-call
  cards for `comm_inbox`, `comm_send`, `comm_approvals`, and `comm_diagnose`.
- A host JSON API that proxies those calls through the **already registered**
  `mcp__agent-mail__*` tools, so the live MCP child is reused.

The 0.1.6 candidate applied the revised visual hierarchy to the mailbox and
adds a **Recipients** view using the current provider roster. Selecting an
identity opens a message draft addressed to it. Connection details are
collapsible; warnings and operation failures remain visible. The panel follows
the DSH color scheme and keeps registration distinct from client presence.

The `0.1.7` candidate keeps those mailbox behaviors and adds a **Connection
management** panel. It logs in to the mounted provider host, lists only the
server-authorized DSH profiles and Hub allowlist, and walks the operator
through TLS verification, one-time code redemption, identity confirmation,
save and activation checks. Without the host routes, the panel reports that
management is unconfigured and the mailbox remains available.

## v1 human actions

Unread list, open thread (claim), ack, send a **read** task or `done`, and
quote a message into the composer. Write-effect send is rejected unless the
client sends `confirmWrite: true`; approve/reject are never proxied.

The task completion action is independent of the New message draft. Task
acknowledgement requires a terminal task state; the panel explains that
prerequisite. Claim failures are displayed instead of being silently ignored.

Quote targets the currently selected conversation, including selection
changes while the standalone drawer stays open. Tool cards distinguish
running, failed and successful calls using the DSH tool-result contract.
Unread counts use Agent Mail delivery status, so acknowledged messages in
the all-mail view do not count as unread.

## Pinned combination

| Item | Pin |
|---|---|
| DeepSeek Harness MCP client peer | `0.1.1-rc.2` |
| Companion MCP bundle | `@dff652/dsh-agent-mail` |
| UI candidate | `0.1.8` (unreleased) |
| Auto-wake | not provided |

The UI package activates even when the MCP namespace is missing. The panel
then shows an offline diagnostic instead of failing DSH startup.

## Optional connection wizard

The provider's [authenticated management guide](https://github.com/dff652/agent-mail/blob/main/docs/guides/dsh-management.md)
defines the private password file, profile registry and DSH mount. Configure
those on the management host, explicitly mount `agent-mail/dsh-management`,
install this UI, and restart DSH when the host or MCP child requires it. Keep
homes, CA files, Hub credentials and management passwords out of this package
and out of browser storage.

The operator then logs in, chooses an allowed profile and Hub, enters the Hub
one-time code, confirms the returned new identity and saves the connection. A
`restart_required` result means the selected provider process must be
restarted explicitly before selecting **检查激活**. The UI does not execute
arbitrary restart commands.

If a mutation response is lost, **刷新状态** reconciles the existing
enrollment and does not consume another code. Closing the panel or clearing
its local recovery metadata does not cancel a pending Hub enrollment; use the
explicit cancel action when cancellation is intended. The wizard does not
wake a model or infer recipient presence.

Exact packed-file and browser evidence is recorded in the [P1.2 acceptance
document](../../docs/agent-mail-p12-management-acceptance.md); a source
checkout alone is not release acceptance. Installing a candidate tarball is
not a production upgrade claim.

## Install

Install an exact tarball into a disposable profile. A source checkout is not
release acceptance. Do not install into a live profile from this repository.

```bash
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-ui-0.1.8.tgz
dsh --profile <profile> --dump-config
```

Remove without deleting the Agent Mail provider or mailbox:

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agent-mail-ui
dsh --profile <profile> --dump-config
```

The composed config must contain `id: dsh-agent-mail-ui` exactly once. The
patch is a plain insert and can hot-mount; the companion MCP bundle still
requires a restart when it is first added.

## Mailbox states and UI limits

The panel reports Agent Mail mailbox state separately from client presence.
The recipient roster comes from `comm_list_agents`; it does not prove that a
client is connected. A successful send means the message was submitted to the
mailbox. It does not prove that the recipient client was notified, is online,
or has read the message. Automatic wake and delivery receipts are not
provided.

The panel uses manual refresh and shows the last refresh time. The **Sent**
view is explicitly local to the current panel session: it contains sends that
completed while this panel was open, because the provider does not expose a
global sent-history API. Closing the panel clears this list.

Recipient entries contain provider-supplied IDs, not inferred device locations
or connectivity. The current identity and `human@local` are excluded from the
send picker. An empty directory provides setup guidance; adding identities,
pairing, credential management and network discovery are not UI capabilities
of this candidate. A missing MCP namespace disables sending rather than
reusing a stale recipient directory.

Sending and refreshing are separate outcomes. A successful submission followed
by a refresh failure must retain its sent record and explain the stale view.
Retrying a read operation must not automatically submit the message again.

When a thread is open, the divider between the inbox and detail panes sizes
the inbox to its content. Drag it or focus it and use the arrow keys, Home,
End, or Escape to adjust or restore automatic sizing. Message and task state,
mailbox delivery state, and confirmation are displayed as separate values.

## Identity

Harness remains a non-human identity. This UI will not call `comm_approve` or
`comm_reject`. Pending write effects are shown as waiting for `human@local`.
