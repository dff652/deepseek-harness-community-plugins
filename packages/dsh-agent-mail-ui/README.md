# DSH Agent Mail UI

Host/client DeepSeek Harness plugin that gives humans a mailbox inside the
existing right-hand workbench. It does **not** start `agent-mail-mcp`, copy
Agent Mail handlers, or wake sessions. Mail transport stays in
`@dff652/dsh-agent-mail`.

Seeing both packages in the installed list is expected: the MCP bundle
provides communication tools; this optional UI provides the human mailbox.
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
| Auto-wake | not provided |

The UI package activates even when the MCP namespace is missing. The panel
then shows an offline diagnostic instead of failing DSH startup.

## Install

Install an exact tarball into a disposable profile. A source checkout is not
release acceptance. Do not install into a live profile from this repository.

```bash
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-ui-0.1.4.tgz
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

## Identity

Harness remains a non-human identity. This UI will not call `comm_approve` or
`comm_reject`. Pending write effects are shown as waiting for `human@local`.
