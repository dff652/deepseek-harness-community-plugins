# Unified Agent Mail development candidate

The next `@dff652/dsh-agent-mail@0.2.0` package contains the MCP configuration
and mailbox UI. The standalone UI remains a compatibility package. This is an
unreleased implementation; publication, catalog changes and live upgrades are
separate operations after acceptance.

## Installation and migration

The provider must be installed separately with the deployment environment
described in the [package README](../packages/dsh-agent-mail/README.md).
For a fresh disposable profile, install only the unified tarball:

```bash
dsh plugin --profile web add -w ./dff652-dsh-agent-mail-0.2.0.tgz
dsh --profile web --dump-config
```

For an existing two-package installation, save the prior profile configuration
and exact package tarballs, stop the test instance, then remove the standalone
UI before upgrading the existing Agent Mail package:

```bash
dsh plugin --profile web remove @dff652/dsh-agent-mail-ui
dsh plugin --profile web add -w ./dff652-dsh-agent-mail-0.2.0.tgz
dsh --profile web --dump-config
```

The composed profile must contain exactly one `mcp-agent-mail` row and one
`dsh-agent-mail-ui` row; the latter now names `@dff652/dsh-agent-mail`.
Do not coinstall the standalone UI with the unified package. Provider home,
identity, connection configuration and credentials must stay the same during
migration. Plugin removal does not delete the separately managed mailbox.
Rollback restores the old MCP tarball and then the old standalone UI tarball.

Use `--profile headless` for MCP use without a browser. The host UI bridge
waits for a web server service; it does not start a second provider process.

## Source and package boundary

UI source stays in `packages/dsh-agent-mail-ui`. `npm run build:agent-mail`
builds that client and copies the reviewed host/view/client assets into the
unified package, rewriting only the package module identity. Run
`npm run check:agent-mail-build` to reject stale generated assets. The packed
artifact has no dependency on a sibling checkout or unpublished UI package.
No provider source or deployment data is copied.

## Acceptance gates

- Repository boundary scan, package contracts and generated asset consistency.
- Exact packed artifact installation in disposable web and headless profiles.
- Migration from the prior two reviewed tarballs, with one MCP and one UI row.
- Real provider sender isolation, persistent sent receipts and restart recovery.
- Browser receipt refresh, panel reopening, hidden-panel cleanup and truthful
  unknown device/connection state.

The install/migration gate accepts the old artifact paths through
`DSH_AGENT_MAIL_OLD_TARBALL` and `DSH_AGENT_MAIL_OLD_UI_TARBALL`:

```bash
node tests/dsh-agent-mail-unified.acceptance.mjs
```

The real receipt gate uses `DSH_AGENT_MAIL_COMMAND` and
`DSH_AGENT_MAIL_CLI` for the reviewed candidate provider. Without additional
settings it uses a disposable local mailbox. Setting
`AGENT_MAIL_ACCEPTANCE_PROVIDER_DIR` to the same installed provider package
also exercises separate client homes through an authenticated TLS Hub,
including Hub disconnect/restart. This is a network integration test on one
machine, not evidence of two physical devices.

```bash
npm run test:receipts:agent-mail
```

## Receipt and device semantics

Sent history is scoped to the configured sender. The Hub derives that sender
from authentication, never a caller-supplied query identity. Original task
receipts use durable task state; a later reply or completion notification has
its own delivery receipt. Hub-to-Hub transport acknowledgment does not prove
that a recipient processed a message. No status in this UI wakes a model.

Recipient identity, device information and Hub address are separate fields.
The current provider has no trusted device-name/IP registration or continuous
presence feed, so those fields remain unknown. A recorded request time is an
observation, not proof that the client remains online. Do not infer a device
address from an identity suffix or the Hub URL.

## Verified on 2026-09-11

| Candidate | SHA-256 | Packed files |
|---|---|---:|
| Agent Mail provider `1.0.0-alpha.7` | `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98` | 117 |
| Unified DSH Agent Mail `0.2.0` | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` | 9 |

The primary agent reviewed both repositories and independently ran:

- Provider lint, typecheck, build and contracts; final full suite: 43 files,
  312 tests passed. Installer regression and pack dry-run passed. A clean
  installation matches all 117 files in the provider archive byte for byte.
- Plugin repository boundary and generated-asset checks; 109 tests passed on
  both Node 22 and Node 24. Both package allowlists passed pack dry-run.
- The exact unified archive installed and removed in disposable web/headless
  profiles. Migration from MCP `0.1.1` plus UI `0.1.7` produced exactly one MCP
  row and one UI row. Leaving the old UI installed fails closed with a duplicate
  loader-entry error. The earlier integrated lifecycle gate also passed missing
  executable, duplicate namespace, reconnect and process cleanup checks.
- Real local MCP and independent clients over authenticated TLS: sender
  isolation, details before first send, process restart, Hub disconnect/restart,
  claim/done/ack receipts and original-task versus notification delivery state.
  The UI normalization of real provider payloads is checked in the same gate.
- Chrome 152 and Firefox 155: 18 fixture scenarios passed on each browser.
- Real DSH web, using the exact unified archive and clean-installed provider:
  details before send, browser-reload persistence, panel-close cleanup/reopen,
  hidden/offline polling suspension and automatic claim/completion updates all
  passed. Wide and narrow screenshots were inspected; the narrow document has
  no horizontal overflow.

The UI displays the most recent 50 sent messages. It polls pending items every
four seconds, backs off failures up to 30 seconds, and pauses after 12 attempts
until manually refreshed. It does not offer older-page navigation yet; the
provider API has a stable pagination cursor. Device name/IP and continuous
connection status remain unknown without a trusted registration/heartbeat.

## Next: isolated acceptance across two hosts

Two hosts have been selected. Read-only preflight confirmed SSH access, direct
LAN routing and the basic runtime/build tools. Host A is a VM and Host B is a
separate machine; this is a cross-host network gate, not a requirement for two
bare-metal computers. The temporary Hub port and application path have not yet
been tested. The TLS acceptance above still proves only independent clients on
one machine.

1. Recheck both hosts and verify the candidate archive digests above. Use new
   temporary installation prefixes, mailbox homes, identities and credentials.
   Install native dependencies on each target; do not copy `node_modules`
   between hosts.
2. Run a disposable DSH web profile and authenticated TLS Hub on Host A, with
   an independent MCP client on Host B. Validate the temporary CA and hostname
   or IP SAN. Check the selected port without changing router/firewall policy.
3. Verify bidirectional send, sender isolation, claim, completion, failure and
   acknowledgment; distinguish task processing from notification delivery.
4. Verify client restart, Hub disconnect/restart and durable sent history.
   Inspect the real browser UI for automatic receipt updates and history after
   reload. Keep unknown device/presence fields truthful.
5. Capture sanitized evidence with versions/digests, remove temporary processes
   and credentials, and check that existing services remain healthy.

One `luna-worker` can own Host B's isolated installation and client-side checks.
The primary agent owns Host A, integration orchestration, complete diff review,
independent cross-host verification and final acceptance. Workers must preserve
other contributors' changes. A worker summary alone does not pass the gate.

The next task should report each check as passed, failed or not run, together
with cleanup results and remaining limitations. Machine-specific instructions
belong in a private handoff, outside this public repository.

Local source commits do not constitute publication or deployment. After this
gate passes, decide separately on fixes/commits, push, tags/releases, npm
publication, the existing catalog request and production migration. The catalog
follow-up should reflect the unified package and avoid a duplicate standalone
UI entry. Automatic model wake-up, trusted device registration/presence and
older-history navigation remain separate feature work.
