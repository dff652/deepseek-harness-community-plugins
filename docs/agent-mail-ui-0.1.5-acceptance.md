# Agent Mail UI 0.1.5 candidate acceptance

Date: 2026-09-09. Status: local candidate, not released or installed live.
The released/live UI baseline remains `0.1.4`.

## Scope

Implements the [September 9 review](agent-mail-2026-09-09-review.md): Chinese
actions, message/task send labels, a compact resizable list, readable thread
subjects, expandable identifiers, distinct task and acknowledgement states,
explicit unknown client presence/receipts, manual refresh and selected-detail
refresh after external acknowledgement. The sent view contains only sends
performed during the current panel lifetime; it is not persistent history.

The primary review also corrected unavailable-state wording and constrained
the standalone drawer to the viewport. Existing session Quote, claim errors,
task terminal guards and human-only approval boundaries remain in scope.
The final sidebar review also fixed a stale inbox row: successful claim now
updates the matching list row as well as the selected detail. The new list
update runs only after a successful claim response.

## Exact candidate

`dff652-dsh-agent-mail-ui-0.1.5.tgz` has SHA-256:

```text
66b714fd0f611dd3da2fd2e425336f4d50c68002d20754e9dbcd2f1e450059cd
```

This supersedes the earlier unpublished 0.1.5 archive with SHA-256
`811e175ded3db51f0b2bc502904210b93760f3e63a1cc9ee2ad4fa34dd01e6a8`.
The version remains 0.1.5 because neither candidate was released. Historical
peer/model results below retain their original artifact boundary; the
current candidate's affected package and browser gates were rerun.

The eight files are `LICENSE`, `NOTICE`, `README.md`, `client.js`,
`cordis.patch.yml`, `index.js`, `package.json` and `view.js`. The primary agent
checked the archive allowlist, regular-file entries and equality of every
packed file with its source. A separate clean-profile pack reproduced the
same digest. Neither provider source nor machine configuration is included.

## Verified gates

| Gate | Result and scope |
|---|---|
| Node 22.19 portable tests | PASS, 99/99 |
| Node 24.19 portable tests | PASS, 99/99 |
| Generated client check | PASS |
| Public boundary and diff whitespace | PASS |
| npm pack dry run | PASS, exact eight-file allowlist |
| DSH rc.2 activation | PASS; UI inserts without provider environment |
| Exact packed Web/headless clean profiles | PASS; install once, remove, no extra MCP child |
| Real provider through UI dispatcher | PASS; claim renewal, premature confirmation rejection, Done/ack, acknowledged all-mail state, missing-ID tail contract and claim failures |
| Chrome 152 fixture browser | PASS, five scenarios |
| Firefox 155 fixture browser | PASS, five scenarios |
| Chrome 152 real DSH standalone | PASS; exact candidate and disposable provider mailbox |
| Chrome 152 real DSH sidebar | PASS; exact revised candidate with better-sidebar 0.12.2 and disposable provider mailbox |
| Chrome 152 sidebar without injected loader/context probe | PASS; normal workspace selection, synchronized claimed row, Quote in visible conversation composer, real tab close/remount, sending and refresh |
| Claim-state regression | PASS on revised client; original archived client fails the new visible-row assertion |
| Independent source and browser review | PASS; minimal state fix, generated bundle, behavioral regression and real browser evidence |
| Historical two-local-DSH peer check | PASS on the previous candidate; distinct plugin APIs, recipient isolation and claim/ack verified |

The fixture scenarios cover sidebar sending and task completion, external
acknowledgement followed by manual refresh, standalone selected-session Quote,
failed claim, and DSH-shaped running/success/error tool cards. They use a
synthetic HTTP backend and do not establish real DSH browser acceptance.

The real standalone and sidebar browser checks cover Chinese actions,
content-sized short lists, pointer resizing and Escape reset, narrow viewport, claim, premature
acknowledgement rejection, Done/ack, duplicate-Done guard, reload followed by
provider-validated acknowledgement, selected-session Quote, task/message sends
observed by a separate recipient MCP client, and temporary sent-record scope.
An additional sidebar run used no loader/context probe. It selected the
workspace through normal controls, verified the quote in the visible main
composer, sent a message observed by a separate recipient MCP client, and
clicked the actual Agent Mail tab close button. Reopening the tab cleared
panel-local sent history without reloading the page; manual refresh worked.
The more detailed probe-assisted run still uses internal session APIs for
two-session draft isolation; that evidence remains distinct from visible
workspace/composer checks.

The first sidebar attempt had an overly narrow test selector, followed by a
disposable startup dependency-resolution failure. The later fresh profiles
started successfully without changing the runtime or dependency pins; that
failure did not recur, but its original cause was not isolated. Screenshot
review then found the stale claim row that the old harness missed. The new
regression fails on the original archived client and passes on the revised
client. Both real browser surfaces now assert the corrected row state.

The sidebar run used better-sidebar 0.12.2 with archive SHA-256
`fa24470fad91ca2c087a8b388c6542108a60410ce5b459471a0fbc0b384df1de`.
Its previously documented rc.6-family peer declaration remains an explicit
compatibility exception; this is measured rc.2 behavior, not static peer
contract compliance.

All test profiles, provider stores and test listeners were removed. The
existing preview and live profiles were preserved and were not upgraded.

The later [peer acceptance plan](agent-mail-peer-acceptance-plan.md) records
same-host and cross-host DSH-to-DSH passes, including TLS/authentication and
bounded client/Hub restart checks. The subsequent real Codex app-server to
remote DSH bidirectional MCP transport and Codex restart checks also passed.
Those transport checks used the original candidate digest. They remain
separate from the revised browser gate and do not establish model execution
or desktop task reload.

## Separate receiving-client evidence

The [connection review](agent-mail-2026-09-09-review.md#receiving-client-result)
records a real Codex app-server loading the private MCP configuration and
receiving, claiming and acknowledging the owner-authorized browser test
message. That baseline send used the live UI `0.1.4`; it is not evidence of
a `0.1.5` live deployment, model execution or automatic wake.

## Additional isolated model-execution check

This historical model check used the original candidate digest, before the
claim-row correction. After the owner configured a model provider in that
preview, the primary agent verified a minimal inference response and a manually started
DSH conversation using the real provider and disposable Agent Mail mailbox.
The model read and claimed the seeded task and sent a reply that a separate
recipient MCP client observed. Its first reply used `type: "message"`, so the
provider correctly rejected acknowledgement of the non-terminal task.

After an explicit corrective prompt specifying `type: "done"`, the model sent
the terminal result and acknowledged the original task. The independent
recipient check matched the completion marker and original thread/task IDs;
the original delivery was `acked`. This passes the manually prompted
model/tool/mailbox workflow after correction. It does not establish an
unattended first-attempt success, automatic wake or a live deployment.

The preview configuration also required removal of a leading space in its
model ID and explicit capacities matching the serving engine and gateway.
The initial default output budget was rejected by the gateway and classified
by DSH as `CONTEXT_WINDOW_EXCEEDED`; the corrected fresh session reached real
tool calls. Configuration and rollback copies remain outside this repository.
See the [model-execution procedure](agent-mail-client-connection.md#optional-model-execution-check)
for the distinction between context capacity, output limits and terminal task
messages.

The owner authorized a local source/documentation commit for this candidate.
Push, tag, GitHub Release, npm publication and live UI deployment have not
been performed. Any packaged-file change invalidates this digest and requires
the affected gates to be repeated.
