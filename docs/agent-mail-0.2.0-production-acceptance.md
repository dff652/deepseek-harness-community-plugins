# Agent Mail 0.2.0 production acceptance

On 2026-09-11, the owner authorized the Host A production cutover and
software rollback on failure. The main agent performed production changes
and live acceptance; a bounded worker checked release materials and the
resulting configuration read-only. This record is separate from the earlier
[release](agent-mail-0.2.0-release.md) and the
[migration SOP](agent-mail-production-migration-plan.md).

## Installed bytes and preserved configuration

| Component | Before | After | Installed archive SHA-256 |
|---|---|---|---|
| Provider | `1.0.0-alpha.4` | `1.0.0-alpha.7` | `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98` |
| MCP / unified plugin | `0.1.1` | `0.2.0` | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` |
| Standalone UI | `0.1.4` | Removed; UI comes from unified package | — |
| DSH core | `0.1.1-rc.2` | Unchanged | — |

The installed archives were byte-checked against anonymous GitHub Release
downloads. The provider was installed alongside the old tree and runs under
Node 20; DSH still runs under Node 24. The existing mailbox home, identity,
roster and connection configuration were retained. Production still uses a
local mailbox with no Hub URL. Unrelated plugin pins and the preview instance
were preserved. The composed profile has exactly one `mcp-agent-mail` and one
`dsh-agent-mail-ui`; the UI module is `@dff652/dsh-agent-mail`.

## Backup and rollback evidence

Deployment files, wrappers, old provider, core runtime, and the stopped live
DSH home were backed up in protected local storage. The production LAN socket
and dependent proxy were stopped with DSH because an incoming connection can
otherwise reactivate DSH during the backup window. They were restored after
the cutover.

With no open mailbox files detected, SQLite checkpoint returned `[0, 0, 0]`.
The final image used SQLite's backup API. Native read-only integrity and a
disposable restore check passed. The baseline contained seven messages,
seven deliveries, three tasks and 25 events. Original message row digests
were verified after acceptance without publishing their bodies.

On a further disposable copy of the final backup, alpha.7 created a task and
completion receipt; alpha.4 reopened the database, retained both, and
acknowledged the task. Exact old plugins also passed an isolated
`0.1.1 + UI 0.1.4 → 0.2.0 → 0.1.1 + UI 0.1.4` rollback rehearsal.
Production was never pointed at either disposable copy.

Retain the protected backup set and old runtime until an explicit owner
cleanup decision. No automatic expiration or cleanup job was installed.
After the accepted test sends, rollback must keep the current mailbox;
restoring the T0 database would discard new mail.

## Live acceptance

| Case | Production evidence | Result |
|---|---|---|
| L0 configuration | Unified UI name; one MCP and one UI; other pins retained | Pass |
| L1 submit feedback | Browser send to a second existing non-human roster identity; submitted row and real recipient inbox | Pass |
| L2 refresh failure | Browser-only fetch interruption after accepted send produced the truthful success/refresh-failed banner; subsequent refresh recovered history; exactly one message for the marker | Pass |
| L3 durable history | Browser reload and page close/reopen recovered both marked tasks from provider history | Pass |
| L4 recipient receipts | A separate MCP client on the same production mailbox claimed two tasks, sent `done` / `error` respectively, and acknowledged originals; origin UI updated automatically | Pass |
| L5 restart recovery | One deliberate production restart; durable completed/failed rows returned; no automatic restarts; mailbox integrity and original message preservation passed | Pass |

The recipient was an existing production roster identity on Host A, as
permitted by the SOP's local-mailbox topology. No production Hub, Host B
service change, model invocation or automatic task consumer was introduced.
The two synthetic tasks and their receipts remain as audit records.

The L2 harness initially expected the marked row while reads were deliberately
blocked. The UI correctly showed the refresh-failed banner with no readable
history. The already accepted send was resolved through the recipient MCP
inbox and then refreshed; it was never resent. A separate harness check also
assumed an Explorer tab was present. Page close/reopen was used to verify the
actual unmount/remount lifecycle. These harness assumptions did not require
product or live service changes.

The pre-cutover browser probe initially expected a newer UI selector against
the old UI; the visible legacy page and status API passed after adapting the
probe. Immediately after the deliberate restart, the first browser navigation
raced HTTP readiness and returned connection refused. The post-ready rerun
passed. Twenty original session files retained their baseline digests; the
final process check found one Agent Mail provider and one AgentMemory provider.
These are harness/version and startup-timing findings, not evidence of lost
mail or a required production rollback.

## Limits and follow-up

The browser acceptance used the actual production loopback web profile.
The existing TLS front door returned its normal authentication challenge with
a valid certificate when reached through its known route. System DNS remained
unavailable in the probe environment, and authenticated public HTTPS browser
acceptance was not performed. No DNS or authentication settings were changed.

Recipient details are available, but alpha.7 deliberately returns unknown for
device name, device IP and continuous connection state. The UI does not yet
provide actual recipient IP discovery. Trusted device registration and
heartbeat semantics remain U3 in the [task list](agent-mail-release-tasks.md).

Catalog PR #4837 remains a separate upstream merge/check item; direct
installation of the published archives does not prove store availability.
This acceptance record does not authorize a new commit, push or publication.
