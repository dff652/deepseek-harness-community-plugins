# Agent Mail UI release and upgrade plan

Review date: 2026-09-05. Local candidate: `@dff652/dsh-agent-mail-ui@0.1.3`.

## Decision and scope

Record and commit the tested local work first, then review the complete
unpushed range. A successful targeted test is not a release decision. The
full-range review currently holds release and live upgrade on the findings
below. This document does not authorize push, tag, publication or deployment.

The remote main branch was verified at `df853b0`. The unpushed history starts
with `8187f7b` (UI package) and `27a5a2e` (host API/composer fix), followed by
the local 0.1.3 interaction fixes, tests and documentation. Review includes
the initial UI code and CI/package changes, not only the latest fix diff.

The [acceptance record](agent-mail-ui-acceptance.md) identifies the exact
tested archive and the successful Done/Ack paths. Those results remain valid
for those cases; the broader review found additional untested paths.

## Confirmed review findings

| Priority | Finding and trigger | Required resolution |
|---|---|---|
| P2 | Standalone Quote reads an array or `snapshot.items[0]` in `currentScope`, but DSH rc.2 `sessions.list` exposes `ids`, `byId` and `current`. A valid selected session therefore produces an empty scope and Quote cannot find a composer. | Resolve and subscribe to the actual selected session; test two sessions and navigation while the drawer stays open. Do not choose an arbitrary first session. |
| P2 | Tool cards parse top-level `result/value/output`, while the rc.2 `tool.call.toolview` owner carries `block`. A failed send block renders `Sent` and `ok`; inbox/diagnose cards also miss their actual result data. | Consume the real slot owner and settled result format; preserve running/error/success states and test cards with actual DSH-shaped props. |
| P2 | `inboxItems` defaults `unread` to true when the provider omits that field. Alpha.4 uses `delivery_status`; an `acked` row in the all-mail list consequently contributes 1 to the unread badge. | Derive unread state from delivery status, covering pending, claimed and acked rows in both filter modes. |

Source locations: `packages/dsh-agent-mail-ui/client-src.js` (`currentScope`,
`ToolCard`, `parseResult`) and `packages/dsh-agent-mail-ui/view.js`
(`inboxItems`, `unreadBadge`). These findings were reproduced without editing
product code or writing to a live mailbox. They are not fixed by this
documentation/commit step.

## Runtime baseline and compatibility gate

Read-only inspection found the running DSH process using `0.1.0-rc.6`.
The live Web profile directly resolves MCP client `0.1.0-rc.6`, Agent Mail
bundle `0.1.1`, UI `0.1.2` and better-sidebar `0.12.2`. A package manifest pin
alone is not proof of the loaded runtime combination.

The accepted 0.1.3 disposable checks instead used DSH/MCP client
`0.1.1-rc.2`. Before a live upgrade, choose and validate the complete target
combination. Either prepare a separately authorized DSH/MCP rc.2 migration
with a core-runtime rollback, or explicitly qualify the intended rc.6
combination. Do not infer rc.6 acceptance from the rc.2 test results.

## Next steps and exit gates

1. **Close review findings locally.** Fix the three paths above and add
   targeted regressions. Rebuild the client bundle; rerun portable checks,
   public-boundary checks and the relevant browser/MCP cases. Any package
   change requires a new pack digest and acceptance record.
2. **Finish browser coverage.** Validate the exact candidate in Chrome and
   with the real better-sidebar plugin, including Quote into the selected
   conversation, tool-result cards, Done/Ack, unread state, reload and
   failure recovery. Fixture sidebar registration is not full integration
   evidence.
3. **Review and push source.** Review all commits relative to current remote
   main, including source, generated bundle, tests and docs. After separate
   push authorization, require CI success for that exact remote commit.
4. **Release reviewed bytes.** After release authorization, use a
   package-specific tag such as `dsh-agent-mail-ui-v0.1.3` only if that remains
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
