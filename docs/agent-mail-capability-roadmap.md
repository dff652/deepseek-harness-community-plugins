# Agent Mail capability boundaries and next steps

Review date: 2026-09-09. This document separates implemented capabilities,
verified client connections, candidate UI acceptance and release/deployment.
Machine configuration and mailbox data remain outside this repository.

## What is usable now

Agent Mail's core transport is usable in the reviewed DSH combination. This
is not a claim that every local or remote AI client is already connected.
Model location and mail-client location are different: a DSH conversation
calling a remote model API still uses the DSH host's Agent Mail connection.
That model test does not qualify a second machine's AI client or mailbox.

| Path or behavior | Evidence and current boundary |
|---|---|
| Live DSH UI to Agent Mail | UI 0.1.4 browser Send and recipient MCP read passed; the provider reports version 1.0.0-alpha.4 |
| Codex receiving client on the same host | A fresh Codex app-server loaded the saved MCP configuration and read, claimed and acknowledged the authorized canary; a later independent read confirmed the acknowledgement |
| Current owner conversation after configuration change | A saved MCP entry does not prove that an already-running conversation reloaded its tool catalog |
| Candidate UI 0.1.5 | Source and independent review passed, including 99 portable tests, exact archive checks and real standalone browser acceptance; full real sidebar acceptance remains incomplete |
| DSH model reading and replying | Passed in the separate candidate preview and isolated mailbox; the model reply was independently observed at the recipient |
| Model task completion and acknowledgement | Passed after a corrective prompt explicitly set `type: "done"`; the first ordinary reply correctly failed the terminal-task acknowledgement guard |
| Other local AI clients | Require their own identity and actual CLI/MCP connection to the intended mailbox; a roster entry is not connection evidence |
| AI clients on another machine | Remote provider routes require deployment and per-client acceptance; no real cross-machine client round trip was established in this review |
| Automatic notification or execution | Not enabled by installing these bundles; UI status explicitly reports no automatic wake and unknown client presence |

See the [delivery review](agent-mail-2026-09-09-review.md),
[connection procedure](agent-mail-client-connection.md) and
[exact 0.1.5 acceptance record](agent-mail-ui-0.1.5-acceptance.md).

## Full provider and DSH packages

The full Agent Mail project is the service/CLI/MCP implementation. The DSH
packages connect that separately installed provider to the host. Installing
a bundle does not replace the provider with a smaller implementation.

| Component | Responsibility | Limits |
|---|---|---|
| Full Agent Mail provider | Owns message storage, identities, task state, approval policy and its supported transports/operational commands | Must be separately installed, configured and operated; source availability is not proof of a connected client |
| `@dff652/dsh-agent-mail` | Starts the reviewed external stdio MCP command under the `agent-mail` namespace and passes deployment-owned identity, home and optional Hub URL | Contains no provider binary, mailbox, remote credentials or automatic wake runner |
| `@dff652/dsh-agent-mail-ui` | Reuses the registered MCP tools for diagnose, roster, inbox, thread, send, claim, acknowledgement and approval-list queries | Offers a subset of provider operations; no provider administration, human approve/reject, persistent sent history or client-presence service |

The bundle pins a reviewed provider identity in its documentation. Newer
provider source at the same displayed version is not automatically the exact
reviewed executable. Compare source commit and artifact digest before an
upgrade; upgrade and qualify the provider separately from the UI.

The full-provider checkout supplied for this comparison is an **archived
checkout**, at commit `97710415187df20b6fa61daa39d8499f3db24e8e` on
`archive/old-checkout-9771041-20260807`. Its package version is
`1.0.0-alpha.4`. The bundle's reviewed provider identity is commit
`ca6601c95eeda2d5d558cca37179be1412b75a8d`; that object is absent from the
archived checkout. Matching version strings do not establish identical
source or runtime bytes. Locate the maintained provider checkout before
planning changes to its implementation.

The following provider implementation findings apply to that inspected
snapshot; they are not a fresh acceptance of every provider subsystem.

| Capability | Full-provider source | DSH bundle/UI boundary |
|---|---|---|
| MCP tools | Eleven tools: send, inbox, claim, ack, roster, approve, reject, approvals, tail, events and diagnose | The bundle mounts the external provider's discovery; its reviewed fixture expects eleven tools. The UI proxies eight non-human operations, excluding approve, reject and events |
| Local CLI and storage | Local message/task operations, store and operational commands | Delegated to the external provider; the package contains no store or provider CLI |
| Remote data plane | HTTPS bearer Hub plus remote MCP and `RemoteMailClient` methods for identity, send, inbox, claim, ack, roster and thread | Requires explicit remote-mode environment and provider token-file setup; the bundle does not provision either end |
| Remote approvals | Hub has approval endpoints, but the inspected remote client/MCP do not route approval operations | Not supplied by this UI; a remote approval-required task must remain pending until an explicitly supported human workflow exists |
| SSE and federation | Hub SSE/federation routes and a bounded remote SSE helper exist | No event-consumer or federation administration surface in these DSH packages; not cross-machine acceptance |
| Wake/runner | Local dry-run/live bridge and constrained Codex, Grok and Claude argv runners already exist | Not started by the bundle. The inspected bridge CLI calls only local processing; remote SSE helper wiring and the full remote runner path remain incomplete |

Provider-source references, relative to the inspected provider checkout:
`packages/agent-mail/src/mcp/server.ts`, `src/connection.ts`,
`src/remote-client.ts`, `src/hub/server.ts`, `src/wake/bridge.ts`,
`src/wake/runner.ts` and `src/cli.ts` (the abbreviated `src/` paths are within
`packages/agent-mail`). Deployment boundaries are documented in that
checkout's `docs/guides/hub-remote.md` and
`docs/guides/usage-modes-and-acceptance.md`. This repository's contract fixture
is [agent-mail-tools.json](../tests/fixtures/agent-mail-tools.json).

## Connecting local and remote clients

For local clients, use distinct registered identities and the same intended
Agent Mail store. Verify through the client runtime itself, not just a
separate provider process. The Codex entry in this review exposes eight
non-human MCP tools and deliberately excludes human approve/reject tools.

For remote clients, use the provider's supported Hub/remote route and its
identity-bound authentication. The bundle's optional `DSH_AGENT_MAIL_HUB_URL`
and provider-owned token-file configuration enable a route; they do not
provision a Hub or configure the recipient automatically. Matching identity
names in unrelated mailboxes does not connect those mailboxes. Do not solve
cross-machine connectivity by assuming a shared SQLite file is a supported
transport.

In the inspected provider, `AGENT_MAIL_HUB_URL` activates remote MCP mode.
Saving `connect set` alone does not switch MCP mode, and local CLI
`send/inbox/claim/ack` still use the local store. `connect test` proves only
the connection/authentication checks it performs, not the full round trip.
Remote approvals also remain a separate limitation in that snapshot.

Record an acceptance row per real client and route: provider version/digest,
client configuration loaded, identity and target store verified, unique
message sent, exact recipient match, reverse reply matched, and expected
claim/terminal/ack state. Record reconnect behavior separately. Credentials,
message contents and deployment endpoints belong in private operational
evidence, not in this public document.

## Ordered follow-up checklist

| Priority | Task and owner | Completion evidence |
|---|---|---|
| P0 | Primary agent: finish exact 0.1.5 real sidebar acceptance in a reproducible disposable DSH environment | Resolve the startup dependency failure, rerun the corrected browser harness against the frozen digest, verify send/receive, task guards, refresh, Quote, layout and cleanup; record a full PASS or an actionable product defect |
| P0 | Primary agent: locate the maintained provider source before provider changes | Identify the active checkout, branch and commit, compare them to the reviewed runtime digest, and preserve the supplied archived checkout |
| P0 | Owner selects the intended remote client/Hub topology; integration worker implements one bounded client connection | One real cross-machine bidirectional canary, identity/auth checks, claim and acknowledgement, plus reconnect acceptance; preserve a client-by-client matrix |
| P0 | Primary agent: qualify each intended local AI client | A runtime that loaded its MCP/CLI configuration retrieves its own uniquely marked mail and replies; distinguish configured, connected, notified and executed states |
| P1 | Primary agent: prepare 0.1.5 release and live-upgrade evidence after remaining gates pass | Reviewed source, exact archive/digest, CI after authorized push, installation/removal, protected backup, rollback and live browser/client acceptance; push, release and deployment remain separate owner decisions |
| P1 | Provider/host integration task: reuse existing bridge/runners for opt-in wake | Qualify the existing local Codex/Grok/Claude path, wire the remote SSE helper into the intended CLI workflow if needed, and verify real remote execution, session routing, retries, failure visibility, limits and a stop switch; do not build a second runner inside the UI |
| P1 | Provider API task: persistent sent-history and receipt/presence semantics | Define stored history, mailbox delivery, client retrieval, acknowledgement and presence independently; add the provider contract before expanding the UI |
| P1 | Provider/client integration task: reliable model task completion | Regression showing that ordinary replies cannot acknowledge unfinished tasks, explicit terminal-result arguments, failure recovery and independent state verification |
| P2 | UI follow-up after provider contracts exist | Add navigation, persistent history, richer task outcomes or notification indicators only for capabilities the provider actually exposes |

A bounded `luna-worker` is appropriate for one client adapter, one independent
comparison or one isolated browser-test repair. The primary agent owns the
complete diff, evidence review, final tests and commit. Avoid parallel edits
to the same profile or mailbox; publication and live operations stay under
their separate authorization boundaries.
