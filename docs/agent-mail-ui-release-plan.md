# Agent Mail UI release and upgrade plan

Review date: 2026-09-05. Local candidate: `@dff652/dsh-agent-mail-ui@0.1.4`.

## Decision and scope

The 0.1.4 follow-up closes the three P2 implementation findings below. Local
acceptance and complete-range review precede any external transition. This
document does not authorize push, tag, publication or deployment.

Remote main was verified at `df853b0`. The unpushed history starts with
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
3. **Review and push source.** Review all commits relative to current remote
   main, including source, generated bundle, tests and docs. After separate
   push authorization, require CI success for that exact remote commit.
4. **Release reviewed bytes.** After release authorization, use a
   package-specific tag such as `dsh-agent-mail-ui-v0.1.4` only if that remains
   the selected version. Pack from the reviewed commit, attach the exact
   archive and `SHA256SUMS`, anonymously download them and verify the digest.
   Revalidate downloaded bytes in a disposable profile. npm and marketplace
   publication are separate choices; a GitHub Release is sufficient to
   distribute an explicitly selected tarball upgrade.
5. **Prepare and authorize the live upgrade.** Confirm target core/MCP/UI
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

## Delegation

A luna-worker can own each bounded implementation or browser-test task in
disjoint files. Another bounded worker can inspect release-document
consistency. The primary agent owns the complete diff review, exact staging,
commit verification, evidence assessment and all release/deployment
decisions. Workers do not push or change live installations.
