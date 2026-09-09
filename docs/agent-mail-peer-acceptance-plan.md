# DSH peer communication acceptance order

Owner priority, 2026-09-09: qualify **DSH to DSH first, then DSH to Codex**.
Other AI clients and automatic wake follow those two supported combinations.
This is the acceptance order, not a claim that every stage has passed.

## Recorded progress

Stage 1 passed in both the worker's run and the primary agent's separate
fresh-profile rerun. Two DSH `0.1.1-rc.2` processes each installed exactly one
Agent Mail `0.1.1` bundle and UI `0.1.5` bundle. The provider used a new shared
local store and two distinct non-human identities, without a Hub or model.

Both directions used the corresponding DSH `/agent-mail-ui/api` route for
send, inbox, claim and acknowledgement. Each recipient observed the exact
message in pending, claimed and acknowledged states; acknowledgement removed
it from the unread inbox. All-mail views contained only their own deliveries
and did not contain their outbound messages. This checks inbox recipient
isolation, not every adversarial identity/authentication case in stage 4.

The tested package SHA-256 values were:

- Agent Mail bundle: `03664058d3a7c56d9a151f3a57091d06102d564f66b8cb2efe5f432fa5c18e0d`
- UI bundle: `811e175ded3db51f0b2bc502904210b93760f3e63a1cc9ee2ad4fa34dd01e6a8`

Both runs removed their own DSH profiles and test store. Existing preview and
live services were preserved. Those same-host runs alone did not qualify
cross-host delivery or DSH-to-Codex bidirectional acceptance. The earlier
manually corrected model flow is separate evidence
in the [0.1.5 record](agent-mail-ui-0.1.5-acceptance.md).

## Cross-host execution, 2026-09-09

Stage 2 subsequently **passed** on two separate Linux hosts, using DSH
`0.1.1-rc.2`, Agent Mail bundle `0.1.1` and UI bundle `0.1.5`. Both hosts used
the package digests recorded above. The primary agent ran the acceptance;
a separate reviewer inspected the harness and results. Host B used an
isolated Node 24 runtime without changing its system Node or model service.

Each DSH had its own profile, provider home and identity-bound token file.
Both provider diagnostics reported `remote: true`, `remote_mail_api`, the
same HTTPS Hub and the expected distinct identity. Certificate verification
remained enabled. Client Web listeners were loopback-only; an SSH tunnel
carried the test controller's HTTP calls to Host B, while Host B's provider
connected directly to the Hub over TLS. No mailbox database was shared
between hosts.

| Check | Observed result |
|---|---|
| DSH-A to DSH-B and reverse | PASS: each DSH UI API sent a unique message; recipient verified sender, recipient and body through pending, claimed and acknowledged states |
| Recipient inbox isolation | PASS: acknowledged messages left unread views; outbound deliveries did not appear in the sender's all-mail view |
| Actual remote storage | PASS: Hub records matched the canary IDs and final acknowledged states; both client-local message/delivery tables remained empty |
| Distinct credentials | PASS: separate tokens returned the expected identities from the Hub identity endpoint |
| Authentication and identity negatives | PASS: missing/invalid token returned 401; forged sender returned 403; wrong-recipient claim/ack returned 409 without changing the recipient's pending delivery |
| Certificate trust | PASS: a client without the test trust anchor rejected the TLS certificate |
| Client restart and queued delivery | PASS: Host B's test DSH stopped; A sent while B was unavailable; a new B process using the same profile retrieved one matching delivery and claimed/acknowledged it |
| Hub outage and recovery | PASS: while the test Hub was stopped, both DSH inbox calls reported connection failure; after Hub restart, the existing DSH processes completed another bidirectional round trip |
| Cleanup | PASS: test processes/listeners, remote runtime directory, client profiles, test stores and credentials removed; existing preview/live DSH and model-service listeners preserved |

These results qualify stage 2 and the listed stage-4 cases for this DSH pair.
They are bounded restart checks, not a network-partition or long-running soak
qualification, and they do not prove automatic retries of a failed send,
automatic wake, model execution or DSH-to-Codex communication. The subsequent
Codex run is recorded separately below. Direct Hub negative tests validate
the provider boundary; positive round trips separately validate the installed
DSH plugin path.
Private execution reports and reproducible test scripts remain outside this
public repository. They contain deployment-specific paths and topology.

## Cross-host Codex execution, 2026-09-09

Stage 3's measured **DSH-to-Codex transport path passed** on two Linux hosts.
Host A ran the test TLS Hub and a real `codex-cli 0.153.4` app-server; Host B
ran DSH `0.1.1-rc.2` with the same reviewed Agent Mail/UI package digests as
stage 2. The primary agent executed the test and an independent reviewer
checked the harness and resulting evidence.

The Codex process used a temporary `CODEX_HOME`, a dedicated non-human
identity and an ephemeral app-server thread. Its MCP inventory exposed the
eight configured non-approval tools. Calls used the app-server's
`mcpServer/tool/call` interface; DSH calls used its installed UI API and
existing MCP child. Both providers reported remote mode, the same HTTPS Hub
and their expected distinct identities. The test did not modify the owner's
global Codex configuration.

| Check | Observed result |
|---|---|
| DSH to Codex | PASS: DSH sent; Codex received the exact sender/recipient/body, claimed and acknowledged the message |
| Codex to DSH | PASS: Codex sent through its loaded MCP server; DSH received, claimed and acknowledged the message |
| Delivery and recipient isolation | PASS: both directions matched pending, claimed and acknowledged states; acknowledgement removed unread deliveries; senders did not see outbound deliveries in their inboxes |
| Codex process restart | PASS: the first app-server exited; DSH sent while it was offline; a new process with a different PID and the same temporary configuration retrieved one matching delivery and claimed/acknowledged it |
| Storage and artifact verification | PASS: all three canary IDs were acknowledged in the Hub; both client-local message/delivery tables remained empty; package digests matched on both hosts |
| Cleanup | PASS: both app-server processes stopped; test DSH/Hub/tunnel stopped; temporary remote runtime, Codex configuration, profiles, stores and credentials removed; existing service listeners preserved |

This qualifies the real Codex app-server MCP transport together with DSH's
UI/MCP transport. It does not prove a model chose the tools, automatic wake,
notification in an existing desktop task, or that the owner's current task
reloaded its MCP catalog. No model turn was started. Desktop-session and
model-driven workflows remain separate checks. The UI sidebar release gate
is recorded independently in the candidate acceptance document. Private
execution reports remain outside this public repository.

## Topology

Use distinct identities and isolated test data for every participant. Start
with two independently running DSH instances on one host; then run them on
two independently administered hosts connected through a test Agent Mail
Hub. DSH peers use the installed plugin, not a replacement provider-only test.
Cross-host mail goes through the provider's Hub data plane; the DSH Web
servers do not need to call each other's UI API directly.

| Role | Responsibility |
|---|---|
| Host A | Test Hub and DSH-A, each with isolated state and explicit bindings |
| Host B | DSH-B with its own profile, non-human identity and Hub credential |
| Client host C, if available | Real Codex client runtime for the second integration target |

Two hosts are enough for cross-host qualification. A third host is useful for
the actual desktop Codex workflow, but is not required for the first DSH peer
gate. Two containers on one host qualify multi-instance behavior, not
cross-host network, TLS or reconnect behavior. A remote model API endpoint
also does not count as a remote Agent Mail client.

Use isolated supported runtimes when a host's system Node is outside the
reviewed DSH range. Do not upgrade system Node or repurpose a production
model service merely to prepare these tests. Record device-specific mappings,
access details, credentials and rollback state outside this public repository.

## Ordered gates

| Stage | Path | Required evidence |
|---|---|---|
| 1 | DSH-A to DSH-B and reverse, same host | Two real DSH processes/profiles load the reviewed bundle; messages pass through each DSH plugin route; unique sender/recipient/marker matches; claim/ack and identity isolation verified |
| 2 | DSH-A to DSH-B and reverse, different hosts | Both clients use the same test Hub over verified TLS with distinct identity-bound credentials; prove both directions and the final mailbox states; no shared database file across the network |
| 3 | DSH to Codex and Codex to DSH | The actual Codex runtime loads its MCP connection; match each direction's unique message through the intended clients; prove distinct identities and expected acknowledgement |
| 4 | Reliability and failure cases on the qualified paths | Restart one isolated client/provider, reconnect and retrieve queued mail; reject invalid credentials and unauthorized identity use; retain distinct delivery, terminal-task and execution evidence |
| 5 | Manually started model task flow | Read the task, send an explicit `type: "done"` result with the original task/thread IDs, then acknowledge; independently verify the state and final response |

Transport stages 1-4 do not require model inference. Stage 5 verifies the
model/tool boundary separately. Neither proves automatic wake. A discovered
recipient name, configured credential indicator, health response or successful
`connect test` is not a substitute for the required round trip.

For the inspected provider, remote MCP requires `AGENT_MAIL_HUB_URL`;
`connect set` alone does not switch modes, and the local CLI mail commands do
not automatically become remote. Remote approval routing and full remote
runner CLI wiring remain separate limitations. See the
[capability comparison](agent-mail-capability-roadmap.md).

## Relationship to the UI release

The [revised 0.1.5 candidate](agent-mail-ui-0.1.5-acceptance.md) passed the
local sidebar browser gate after a claim-row synchronization fix. The peer
transport results above retain the earlier artifact digest; they do not
replace the repeated layout, refresh and selected-conversation checks for
the revised package. Keep the reviewed artifact digest, per-stage results and
cleanup evidence together. Installation into a temporary test profile is
separate from a live-profile upgrade.

Release, live deployment and opt-in runner integration follow the recorded
gates and their authorization boundaries. Prefer reusing existing provider
bridge/runners after DSH peers and Codex are qualified.
