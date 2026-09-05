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

The release gate is complete, but the existing full profile adds compatibility
requirements beyond the isolated Agent Mail combination:

| Existing component | Finding | Required decision or evidence |
|---|---|---|
| Private AgentMemory `0.1.0` | Direct dependency on MCP client `0.1.0-rc.6`; this is a different artifact from the public configuration candidate. | Prepare a controlled rc.2 adaptation and verify actual discovery/recall. A candidate-only dependency override is exploratory, not qualification. |
| Git Graph `0.3.13` | Declares `dsh.engines.dsh: >=0.1.2-alpha.4`, which the rc.2 target does not satisfy. The existing rc.6 baseline also falls outside this declaration. | Choose an independently qualified compatible version, approve temporary exclusion from the rc.2 profile, or retain the existing live runtime. Do not silently drop an installed feature. |
| better-sidebar `0.12.2` | Declares rc.6-family peer ranges. | Preserve the recorded real rc.2 integration evidence and explicitly document the compatibility exception; this is not static peer-contract compliance. |

A separate durable rc.2 runtime was built and its version checked. A copy of
the home, excluding old dependency trees, was prepared with all six existing
package versions pinned and the released UI archive selected. Its dependency
installation succeeded using an experimental MCP rc.2 override. No candidate
server, model turn or live cutover was performed during this migration step.
The copied profile is not an accepted production replacement.

The next concrete choice is whether the rc.2 migration may temporarily omit
Git Graph while AgentMemory is adapted. Until that choice and the full-profile
gates are resolved, preserve the running rc.6/UI 0.1.2 environment and all
provider data. Final cutover still needs a fresh stopped copy of the home,
validated rollback pointers, and endpoint/auth/session checks. The current
read-only preflight kept the same live process and recorded config/artifact
hashes: loopback/LAN returned 200; local DNS lookup of the HTTPS entry failed.
Routing directly to the documented proxy returned 401 with successful TLS
verification, which proves only the authentication front door, not authorized
upstream access. DNS and authorized-flow acceptance remain cutover gates.

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
5. **Full-profile migration. HOLD on compatibility decisions above.** Confirm target core/MCP/UI
   versions and the effective loaded plugins, retain the old UI archive and
   digest, and back up the deployment-owned profile/lock/config files. If
   core DSH also changes, retain its prior runtime and rollback procedure.
   Approve the concrete archive and target profile before changing live.
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
