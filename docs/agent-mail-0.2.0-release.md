# Agent Mail 0.2.0 release and catalog handoff

Verified on 2026-09-11. GitHub publication is complete. Production migration
and catalog merge are not implied by publication.

## Published artifacts

| Component | Source commit at tag | Release | SHA-256 |
|---|---|---|---|
| Provider `agent-mail@1.0.0-alpha.7` | `6bdcc67` | [alpha.7 prerelease](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.7) | `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98` |
| Unified `@dff652/dsh-agent-mail@0.2.0` | `47c5589` | [0.2.0 Release](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.2.0) | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` |

The provider Release includes a CycloneDX SBOM, `SHA256SUMS` and workflow
provenance. Its signature was verified against this repository and the
`release.yml` tag workflow at `6bdcc67`. The unified Release includes its
tarball and `SHA256SUMS` and is marked Latest. No npm package or standalone
UI `0.1.8` was published in this operation.

## Verification

- Provider local release gate: 43 files / 312 tests, contracts, lint,
  typecheck, build, isolated installed CLI lifecycle and SBOM closure passed.
- Provider [source CI](https://github.com/dff652/agent-mail/actions/runs/34579155108)
  and [tag release workflow](https://github.com/dff652/agent-mail/actions/runs/34579382751)
  passed; the generated archive matched the accepted candidate exactly.
- Plugin local contracts: 109 passed; boundary and generated-asset checks
  passed. [Source CI](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/34579217638)
  passed on Node 22.19.0 and 24.19.0. The pack allowlist has 9 files.
- Both published archives and their checksums were downloaded anonymously.
  They matched the candidate digests above. All 117 provider archive files
  matched a clean installation byte for byte.
- The downloaded unified archive passed disposable web/headless installation,
  exactly one MCP plus one UI configuration, removal and cleanup.
- The downloaded provider passed sender isolation, pre-send details, durable
  restart, claim/done/ack and authenticated TLS Hub disconnect/restart checks.
- The earlier [two-host and browser evidence](agent-mail-acceptance-closeout.md)
  remains bound to those same bytes. The release pass did not repeat the
  two-host/browser suite or perform a production upgrade.

## Plugin store status

[Catalog PR #4837](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4837)
was updated on its existing branch at `c36e42b7f`. The final diff against
upstream changes one existing Agent Mail YAML: description and 0.2.0 Release
URL. The previously proposed standalone UI YAML is removed from the PR.

The PR remains open. Local YAML parsing and README generation/parity passed.
The site build still fails on the existing added-date derivation errors for
three `wwweljf/dsh-plugins` entries, with unchanged base `5b7be0b95`. No
unrelated catalog entries or build rules were modified. Remote check results
and merge must be followed on the PR; this record does not claim store rollout.

The inspected dshmarket `1.41.0` resolves an entry in this order: valid npm
name, repository-matched Release tarball, then GitHub source. A direct check
of its `installTargetFor` with the proposed entry selected the exact 0.2.0
Release URL. After catalog merge and refresh, verify the actual install target
and version in the store before upgrading. The store UI itself was not used
to install into production during this release pass.

## What users install

Install **one** `@dff652/dsh-agent-mail@0.2.0` package: it includes both the
MCP integration and mailbox UI. An existing two-package deployment must remove
`@dff652/dsh-agent-mail-ui` before upgrading the main package. Co-installing
both UI entries fails closed.

The provider is independent. Durable sent receipts require
`agent-mail@1.0.0-alpha.7`; updating the plugin from the store does not install
or upgrade that provider. Preserve the mailbox home, identity and connection
configuration. “Submitted” means accepted into the mailbox, not human-read,
continuous online presence or automatic model execution.

Next: follow catalog checks/merge, refresh and verify the store entry, then
execute the separately authorized [production migration plan](agent-mail-production-migration-plan.md)
with backups and the real production acceptance matrix. Direct installation
from the published Release is possible before catalog merge, but is still a
production change when pointed at a live profile.
