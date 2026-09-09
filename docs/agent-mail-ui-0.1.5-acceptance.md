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

## Exact candidate

`dff652-dsh-agent-mail-ui-0.1.5.tgz` has SHA-256:

```text
811e175ded3db51f0b2bc502904210b93760f3e63a1cc9ee2ad4fa34dd01e6a8
```

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
| Independent source and receiving-client review | PASS; 99 tests, generated bundle, repository checks, dry pack, exact bytes and read-only Codex receipt verification |
| Two local DSH peer instances | PASS; worker run and primary fresh-profile rerun exchanged messages in both directions through their own plugin APIs; inbox recipient isolation and claim/ack verified |

The fixture scenarios cover sidebar sending and task completion, external
acknowledgement followed by manual refresh, standalone selected-session Quote,
failed claim, and DSH-shaped running/success/error tool cards. They use a
synthetic HTTP backend and do not establish real DSH browser acceptance.

The real standalone browser check covers Chinese actions, content-sized short
lists, pointer resizing and Escape reset, narrow viewport, claim, premature
acknowledgement rejection, Done/ack, duplicate-Done guard, reload followed by
provider-validated acknowledgement, selected-session Quote, task/message sends
observed by a separate recipient MCP client, and temporary sent-record scope.
The real sidebar browser run reached task completion and delivery checks, but
its full acceptance remains incomplete. A test-harness assertion read too
narrow a DOM subtree for sent history; after that assertion was corrected,
the fresh disposable profile failed to resolve `@deepseek-ai/dsh-workspace`
during startup. Partial screenshots do not qualify this gate as PASS. This
does not supersede the passing sidebar fixture scenarios or establish a
failure in the candidate UI itself.

The later [peer acceptance plan](agent-mail-peer-acceptance-plan.md) records
same-host and cross-host DSH-to-DSH passes, including TLS/authentication and
bounded client/Hub restart checks. The Codex bidirectional gate remains
separate and pending. Peer API checks do not supersede the incomplete sidebar
browser gate.

## Separate receiving-client evidence

The [connection review](agent-mail-2026-09-09-review.md#receiving-client-result)
records a real Codex app-server loading the private MCP configuration and
receiving, claiming and acknowledging the owner-authorized browser test
message. That baseline send used the live UI `0.1.4`; it is not evidence of
a `0.1.5` live deployment, model execution or automatic wake.

## Additional isolated model-execution check

After the owner configured a model provider in the separate candidate preview,
the primary agent verified a minimal inference response and a manually started
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
