# Connecting a receiving client

A successful send means that Agent Mail accepted the message. A roster entry
is an address, not a connected client. Receiving clients must use the same
mailbox (or an explicitly configured provider connection) and their own
non-human identity. This UI does not wake a model conversation.

## Codex MCP configuration

Keep machine-specific configuration in the owner's Codex configuration,
outside this repository. The following example uses placeholders only.
Use the reviewed installed runtime, not a floating package download.

```toml
[mcp_servers."agent-mail"]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/reviewed/provider/dist/mcp/stdio.js"]
startup_timeout_sec = 15
tool_timeout_sec = 60
enabled_tools = ["comm_diagnose", "comm_list_agents", "comm_inbox", "comm_tail", "comm_send", "comm_claim", "comm_ack", "comm_approvals"]

[mcp_servers."agent-mail".env]
AGENT_MAIL_HOME = "/absolute/path/to/shared/mailbox"
AGENT_MAIL_ID = "recipient@local"
```

The sender and receiver need different identities in the provider roster.
The mailbox path must be the reviewed existing mailbox; do not initialize a
second empty mailbox and assume the same recipient name connects the stores.
Human approval and rejection tools are intentionally absent from this client
allowlist. Do not use the human identity for an automated receiver.

Codex supports stdio command/arguments, environment configuration and tool
allowlists in its [official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).
User-level configuration is shared across Codex workspaces: the server name
does not select a different mailbox when the working directory changes.
Use explicit project routing if multiple mailboxes are needed.

## Verify the connection

Direct UI and MCP checks of sending, receiving, claiming and acknowledging
do not require a model API: they exercise Agent Mail's transport and task
state. A separate end-to-end check in which DSH invokes a model to process
the message and produce a reply requires a working model provider on that
DSH instance. Model configuration alone does not enable automatic wake.

1. Check `codex mcp get agent-mail --json` locally without copying its
   machine-specific output into this repository.
2. Start a client runtime that has loaded the updated MCP configuration.
   Existing conversations may need their MCP configuration reloaded or a new
   runtime; editing configuration does not prove an existing conversation's
   tool catalog changed.
3. Call `comm_diagnose` and verify the intended non-human identity and store.
4. With owner authorization, send one uniquely marked, non-executing test
   message from DSH. On the recipient, call `comm_inbox`; match the exact
   sender, recipient and marker rather than relying on the inbox count.
5. Claim and acknowledge only that test message, then verify that it no
   longer appears in the unacknowledged list. Task messages require a
   terminal outcome before acknowledgement; use an ordinary message for
   transport-only verification.

Receipt through MCP, acknowledgement and actual model execution are separate
observations. Reading an inbox does not automatically claim or acknowledge
all its messages. A pending/claimed message can remain in the UI's
unacknowledged count even after somebody has visually read it.

For normal use, explicitly ask the recipient client to check Agent Mail.
Background polling, automatic task execution and automatic session injection
are not enabled by this connection. To undo it, remove only the added MCP
server entry, preserving other Codex settings and the shared mailbox.

## Optional model-execution check

Use an isolated workspace and mailbox for a model-driven test. Select the
configured provider/model in the DSH conversation after selecting its
workspace. A configured-provider indicator is not evidence of inference.

Match the model ID exactly, including whitespace. For a custom provider, set
`contextWindow` from the actual serving engine and `maxTokens` at or below
the gateway's output limit. These are different limits. The rc.2 fallback
values of 262,144 context tokens and 32,768 output tokens can exceed a local
deployment's limits; an output-limit rejection may be classified by DSH as
`CONTEXT_WINDOW_EXCEEDED`. Check the gateway's actual error before treating
that label as evidence of a full conversation context. Start a fresh session
after correcting model capacities.

First verify a minimal inference response, then have the model read a unique
test item and send a unique reply. Confirm the reply with a separate recipient
MCP client. For a task-completion check, explicitly require `comm_send` with
`type: "done"`, the original `thread_id` and `task_id`, and only then
`comm_ack` for the original message. Text saying "done" in an ordinary
`message` does not establish a terminal task outcome. Verify the original
delivery state independently as well as the model's final response.

## Measured cross-host Codex path

The [peer acceptance record](agent-mail-peer-acceptance-plan.md#cross-host-codex-execution-2026-09-09)
now includes a real Codex app-server `0.153.4` and a DSH instance on another
host. Both directions passed through their respective MCP connections over
a verified TLS Hub, including claim/ack and Codex process restart recovery.
The test used a temporary Codex configuration and no model turn. It does not
establish that an existing desktop task loaded a newly saved MCP entry or
that a model or runner automatically responds to incoming messages.
