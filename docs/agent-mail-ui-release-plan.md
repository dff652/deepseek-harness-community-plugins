# Agent Mail UI release and upgrade plan

Review date: 2026-09-05. Reviewed release: `@dff652/dsh-agent-mail-ui@0.1.4`.

## Decision and scope

The 0.1.4 follow-up closes the three P2 implementation findings below. Local
acceptance and complete-range review preceded the source, CI and GitHub Release
transitions recorded below. npm, marketplace publication and live deployment
remain separate transitions.

The reviewed source commit is `e179d893a15a71979e8c8a05919a691abe65d5d6` on
`origin/main`; CI run `33945657776` passed on Node 22.19 and 24.19. The history
review started with
`8187f7b` (UI package), `27a5a2e` (host API/composer fix), and `013ddd1`
(0.1.3 interaction fixes and review record), followed by the 0.1.4 changes.
Review includes the initial UI, generated bundle, CI/package changes, tests
and documentation, not only the latest fix.

The [current acceptance record](agent-mail-ui-0.1.4-acceptance.md) identifies
the final archive and each test's scope. [0.1.3 evidence](agent-mail-ui-acceptance.md)
remains historical.

## Review findings and resolutions

| Priority | Finding | 0.1.4 resolution |
|---|---|---|
| P2 | Standalone Quote assumed an array/items snapshot instead of rc.2 `sessions.list`. | Resolve `current` through `byId`, reject stale IDs, and subscribe while the drawer is open. Inject the core sessions service; real Chrome navigation/Quote passes. |
| P2 | Tool cards ignored the actual slot owner's `block`, so failed sends could show success. | Consume `ToolResultNode.content` and running/error/stopped/success states; regression tests use the actual DSH owner contract. |
| P2 | Acknowledged all-mail rows without `unread` counted as unread. | Derive unread from pending/claimed delivery status; real MCP and both browser fixtures cover acknowledged rows. |

Real DSH startup also exposed an intermediate 0.1.4 injection regression
that plain fixtures did not catch. The final pack explicitly injects
`sessions`; the rejected intermediate digest is not release evidence.

## Runtime baseline and compatibility gate

Read-only inspection found the running DSH process using `0.1.0-rc.6`.
The live Web profile directly resolves MCP client `0.1.0-rc.6`, Agent Mail
bundle `0.1.1`, UI `0.1.2` and better-sidebar `0.12.2`. A package manifest pin
alone is not proof of the loaded runtime combination.

The chosen 0.1.4 acceptance target is DSH/MCP client `0.1.1-rc.2`,
Agent Mail bundle `0.1.1`, UI `0.1.4`, and optional better-sidebar `0.12.2`.
This follows the exact manifest peers. A later live upgrade therefore needs
a separately authorized core/MCP migration with a core-runtime rollback,
not only replacement of the UI archive. Retain the rc.6 runtime and prior
profile as the rollback baseline. Do not infer rc.6 acceptance from rc.2
test results; the existing mixed installation remains unqualified.

## Full-profile migration hold (2026-09-05)

The owner approved the rc.2 migration, the private AgentMemory adaptation,
and temporary exclusion of Git Graph. Compatibility decisions are resolved;
actual live cutover is still pending authorized HTTPS access evidence.

| Component | Accepted candidate state |
|---|---|
| Private AgentMemory | Private `0.1.1` uses exact MCP rc.2 peer; four-file archive, distinct from the public package/adapter. Actual discovery, read-only recall, forced test-child failure, reconnect, recall, removal and cleanup passed. |
| Git Graph `0.3.13` | Temporarily excluded with owner approval; its declared DSH range excludes rc.2. The existing rc.6 baseline also falls outside that declaration. |
| better-sidebar `0.12.2` | Real rc.2 integration passed. Its rc.6-family peer declaration remains an explicit compatibility exception, not static peer-contract compliance. |
| Plugin market `1.41.0` | Installed-list and capabilities API passed; five candidate plugins active, no diagnostics. |

A fresh running-home copy was first booted without external plugins, then
received Agent Mail `0.1.1`, released UI `0.1.4`, sidebar, market and the
adapted private AgentMemory. The final profile has no experimental MCP
override or profile-level rc.6 dependency. Private repository contracts passed
70/70 on both Node 22 and Node 24, with independent review; the stable registry
verifier passed while keeping the private rc.2 candidate separately reported.
All 187 installed DSH runtime
modules have version `0.1.1-rc.2`; offline frozen installation exited normally.

Chrome passed the complete five-plugin sidebar combination, including
selected-session Quote, Done/Ack/reload and all-mail state. A pre-existing
session reached `openState=open`, and new blank sessions survived a server
restart. Settings bytes were unchanged; credential format migrated with the
original credential values retained. No model turn or persistent AgentMemory
write was performed; Mail tests used a disposable mailbox.

Staged service units passed verification, and protected rollback configuration
was retained. Live remains rc.6/UI `0.1.2`. Final cutover must stop the old
service and copy its then-current home afresh; rehearsal sessions and test
probes must not be promoted. Restore the old runtime and original home together
if cutover fails.

Loopback/LAN and the TLS authentication front door remain reachable. Local
HTTPS DNS resolution fails, and no reusable local login credential is
available. The owner has been asked to verify the authorized browser flow;
401 alone is not authorized upstream evidence. The older runtime's `/health`
200 was the same HTML as its homepage, not a health API: use actual session,
API and MCP checks rather than treating rc.2's 404 there as a health regression.

## Next steps and exit gates

1. **Local fixes and portable gates complete.** The final source includes
   the three fixes plus the injection correction. Node 22/24 each passed
   98/98 tests; generated bundle, real MCP, clean profiles and exact pack
   checks passed. Any further package change invalidates the recorded digest.
2. **Local browser gates complete.** Both Firefox and Chrome passed fixture
   regressions. The final archive passed real DSH standalone checks in both
   browsers and real better-sidebar interaction in Chrome. Selected-session
   Quote, Done/Ack/reload, all-mail state and no duplicate drawer are covered.
   Tool-card lifecycle uses DSH-shaped fixture owners; no model turn is claimed.
3. **Review and push source. Complete.** The complete history, source,
   generated bundle, tests and docs were reviewed. Commit
   `e179d893a15a71979e8c8a05919a691abe65d5d6` is on `origin/main`, and CI run
   `33945657776` passed on Node 22.19 and 24.19.
4. **Release reviewed bytes. Complete.** Annotated tag
   `dsh-agent-mail-ui-v0.1.4` targets the reviewed commit. The [GitHub
   Release](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-ui-v0.1.4)
   contains the exact eight-file archive and `SHA256SUMS`; anonymous download
   verification reproduced SHA-256
   `ed87f8fca7db9a153e0105a4c89c2b8dca2c108456c85bfb81024c85735fe1e9`.
   Downloaded bytes passed disposable Web/headless install once and remove
   checks. npm and marketplace publication were not performed.
5. **Full-profile candidate validation complete; authorized-entry evidence pending.**
   The owner approved the target combination and temporary Git Graph exclusion.
   Preserve the staged rollback baseline and close the browser-entry gate
   before stopping live; do not promote the running-home rehearsal copy.
6. **Upgrade, verify, or roll back.** Install only the reviewed downloaded
   archive into that profile, then verify the actual loaded version, exactly
   one UI config row, existing MCP-child reuse, and the intended sidebar or
   drawer. Check current-session Quote and mailbox state. A write-producing
   canary must use an expressly designated test mailbox. On failure, restore
   the recorded prior runtime/profile and UI archive, then repeat health and
   UI checks. Do not delete provider data or uninstall the companion bundle
   as part of a UI-only rollback.

See [install/upgrade/rollback](install-upgrade-rollback.md#agent-mail-ui) for
the plugin commands. Completion of each stage should record commit/version,
digest, target runtime, checks and observed result without private paths,
credentials, message contents or deployment data in this repository.

The live profile remains unchanged at UI `0.1.2` on the existing rc.6 runtime.
Migration toward the selected DSH/MCP `0.1.1-rc.2` target is held on the
full-profile compatibility decisions above; the
published UI archive has not been installed live, and no upgraded live state
is claimed.

## Delegation

A luna-worker can own each bounded implementation or browser-test task in
disjoint files. Another bounded worker can inspect release-document
consistency. The primary agent owns the complete diff review, exact staging,
commit verification, evidence assessment and all release/deployment
decisions. Workers do not push or change live installations.
