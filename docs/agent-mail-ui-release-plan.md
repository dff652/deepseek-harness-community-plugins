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

Before this cutover, read-only inspection found the live DSH process using
`0.1.0-rc.6`. The then-live Web profile directly resolved MCP client
`0.1.0-rc.6`, Agent Mail bundle `0.1.1`, UI `0.1.2` and better-sidebar `0.12.2`.
A package manifest pin alone is not proof of the loaded runtime combination.

The chosen 0.1.4 acceptance target was DSH/MCP client `0.1.1-rc.2`,
Agent Mail bundle `0.1.1`, UI `0.1.4`, and optional better-sidebar `0.12.2`.
This followed the exact manifest peers. The separately authorized core/MCP
migration and core-runtime rollback are recorded below. Retain the rc.6
runtime and prior profile as the rollback baseline. Do not infer rc.6
acceptance from rc.2 test results; the former mixed installation remains
unqualified.

## Full-profile migration hold (2026-09-05)

**Status: resolved.**

The owner approved the rc.2 migration, the private AgentMemory adaptation,
and temporary exclusion of Git Graph. A stopped fresh copy of the then-current
live home was cut over; no candidate or rehearsal copy was promoted. The live
profile now runs DSH/MCP `0.1.1-rc.2`, Agent Mail `0.1.1`, UI `0.1.4`, private
AgentMemory `0.1.1`, better-sidebar `0.12.2` and dsh-market `1.41.0`.

| Component | Candidate evidence / validated live state |
|---|---|
| Private AgentMemory | Private `0.1.1` uses exact MCP rc.2 peer; its four-file archive is distinct from the public package/adapter. Disposable candidate discovery, read-only recall, forced test-child failure, reconnect, recall, removal and cleanup passed. The live private package is active; no persistent production write or fault-injection test was performed. |
| Git Graph `0.3.13` | Temporarily excluded with owner approval; its declared DSH range excludes rc.2. The existing rc.6 baseline also falls outside that declaration. |
| better-sidebar `0.12.2` | Disposable candidate real rc.2 integration passed; the live authorized browser rendered the Mail sidebar. Its rc.6-family peer declaration remains an explicit compatibility exception, not static peer-contract compliance. |
| Plugin market `1.41.0` | Disposable candidate installed-list and capabilities API passed; the live package is active and live Mail API/diagnostics checks returned 200. |

The rehearsal profile was first booted without external plugins and then
received Agent Mail `0.1.1`, released UI `0.1.4`, sidebar, market and the
adapted private AgentMemory; it was not promoted. For cutover, the service was
stopped and its then-current home was copied afresh before the approved
combination was activated. The live profile has no experimental MCP override
or profile-level rc.6 dependency.
The disposable candidate passed private repository contracts 70/70 on both
Node 22 and Node 24, with independent review; the stable registry verifier
passed while keeping the private rc.2 candidate separately reported. All 187
installed DSH runtime modules in the activated profile have version
`0.1.1-rc.2`; offline frozen installation exited normally.

The disposable candidate Chrome run passed the complete five-plugin sidebar
combination, including selected-session Quote, Done/Ack/reload and all-mail
state. In the live authorized browser, the pre-existing session reached
`openState=open` and the Mail sidebar rendered; a new blank live session
survived the final server restart. Settings bytes were unchanged; credential
format migrated with the original credential values retained. No model turn
or persistent AgentMemory write was performed; candidate Mail tests used a
disposable mailbox.

Staged service units passed verification, and protected rollback configuration
was retained. The post-cutover restart passed with `NRestarts=0`; live Mail API
and diagnostics checks returned 200. The old rc.6 runtime and original home
remain available as a paired rollback baseline. Restore them together if a
later observation fails.

Loopback/LAN and the TLS authentication front door remain reachable. The
authorized HTTPS browser flow passed with the existing session open and the
Mail sidebar rendered; the new blank live session also persisted across the
final restart. System DNS still does not resolve the entry and was not
changed; the browser used the existing proxy mapping over valid TLS. The older
runtime's `/health` 200 was the same HTML as its homepage, not a health API:
use actual session, API and MCP checks rather than treating rc.2's 404 there as
a health regression.

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
5. **Live migration and authorized-entry verification complete.** The approved
   target combination is active after a stop-and-fresh-copy cutover with Git
   Graph temporarily excluded. The existing HTTPS session opened, the Mail
   sidebar rendered, the new blank session survived restart, and live Mail API
   plus diagnostics checks returned 200. System DNS was unchanged; browser
   access used the existing proxy mapping and valid TLS.
6. **Observe and retain rollback.** Keep the old rc.6 runtime/home and the
   cutover baseline for the observation period. On failure, restore the old
   runtime and original home together, then repeat the session, API, MCP and UI
   checks. Do not delete provider data or uninstall the companion bundle as
   part of a UI-only rollback. Host systemd units, the LAN socket and the TLS
   front door belong to the host deployment tree, not this repository.

See [install/upgrade/rollback](install-upgrade-rollback.md#agent-mail-ui) for
the plugin commands. Completion of each stage should record commit/version,
digest, target runtime, checks and observed result without private paths,
credentials, message contents or deployment data in this repository.

The live profile now runs DSH/MCP `0.1.1-rc.2`, Agent Mail `0.1.1`, UI
`0.1.4`, private AgentMemory `0.1.1`, better-sidebar `0.12.2` and dsh-market
`1.41.0`; Git Graph is temporarily excluded. The cutover used a stopped fresh
copy of the then-current home and the reviewed UI archive. Authorized browser,
Mail sidebar, live API/diagnostics and post-restart session checks passed.
System DNS remains unchanged and the old rc.6 runtime/home are retained for
rollback. npm and marketplace publication remain separate transitions.

## Delegation

A luna-worker can own each bounded implementation or browser-test task in
disjoint files. Another bounded worker can inspect release-document
consistency. The primary agent owns the complete diff review, exact staging,
commit verification, evidence assessment and all release/deployment
decisions. Workers do not push or change live installations.
