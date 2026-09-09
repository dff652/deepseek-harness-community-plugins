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
live services were preserved. Stages 2-4 remain unqualified by these results;
they do not establish cross-host delivery or DSH-to-Codex bidirectional
acceptance. The earlier manually corrected model flow is separate evidence
in the [0.1.5 record](agent-mail-ui-0.1.5-acceptance.md).

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

The exact 0.1.5 sidebar browser gate still needs completion before treating
the candidate as fully accepted for release. Peer transport tests complement
that gate; they do not replace layout, refresh and selected-conversation
interaction checks. Keep the reviewed artifact digest, per-stage results and
cleanup evidence together. Installation into a temporary test profile is
separate from a live-profile upgrade.

Release, live deployment and opt-in runner integration follow the recorded
gates and their authorization boundaries. Prefer reusing existing provider
bridge/runners after DSH peers and Codex are qualified.
