# Agent Mail release preparation (T2)

Execution results supersede the preparation snapshot below: see the
[0.2.0 release and catalog handoff](agent-mail-0.2.0-release.md).

Status date: 2026-09-11. This is a preparation record only. It does not
authorize commit, push, tag, GitHub Release, npm publication, catalog edits,
PR comments or production migration.

Candidates remain the reviewed local archives recorded in the
[unified candidate](agent-mail-unified-candidate.md) and the
[cross-host closeout](agent-mail-acceptance-closeout.md). This session did not
repack, retag or rehash those bytes.

Public placeholders only: Host A/B and `/absolute/path/to/...`. Machine
addresses, usernames, homes, tokens and certificates stay in the protected
local evidence directory.

## 1. Catalog PR 4837

Verified from GitHub search, `gh pr view`, the live catalog, a local
`awesome-dsh-plugin` checkout and `dshplugin.world`. A miss inside this plugin
repository is not treated as absence.

| Field | Verified value |
|---|---|
| Full URL | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4837 |
| State | **OPEN**, not draft, not merged (`merged_at` null) as of 2026-09-11T07:44Z |
| Created / last update | 2026-09-11T04:34:04Z / 2026-09-11T04:34:04Z |
| Author | `dff652` |
| Base | `awesome-dsh-plugin/awesome-dsh-plugin` `main` |
| Head | `dff652/awesome-dsh-plugin` `codex/agent-mail-catalog-017` @ `d9ec6c02802719b1e896f6f37c7ee054c2134c51` |
| Title | Add Agent Mail UI and update Agent Mail MCP release |
| Issue comments / review comments | 0 / 0 (no body comments; one later PR mentioned this number) |
| Submission gate | PASS (`103149086933`, 2026-09-11T04:37:32Z) |
| PR check | **FAIL** (`34562684361` / job `103148467528`, 2026-09-11T04:37:03Z) |

The failed check step is `Build (locale parity, date derivation, templates)`.
YAML, README generation, awesome-lint and the stale-fork guard passed. The PR
body records that site build is blocked on both this branch and untouched base
commit `5b7be0b95` because no added-date can be derived for three existing
`wwweljf/dsh-plugins` entries (`dsh-ding-sound`, `dsh-wx-push`,
`dsh-wx-remote`). That is a catalog-repo issue, not an Agent Mail YAML syntax
failure. This session did not comment on the PR.

### Current Agent Mail catalog entries

Live `main` and the public site still have **one** Agent Mail listing, the
MCP-only 0.1.0 artifact from merged
[#2988](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2988)
(merged 2026-08-24T14:24:36Z). No standalone UI listing exists on `main`.

| Surface | Live catalog (`main` / site) | PR 4837 head |
|---|---|---|
| Unified MCP+UI | **Absent.** Existing name is MCP-only. | **Absent.** MCP YAML stays MCP-only. |
| MCP entry | Present: `dff652/deepseek-harness-community-plugins#dsh-agent-mail`, category `tools`, tarball `dsh-agent-mail-v0.1.0` / `dff652-dsh-agent-mail-0.1.0.tgz`, `npm: null`, added 2026-08-24 | Same name/category/description; tarball only changes to `dsh-agent-mail-v0.1.1` / `dff652-dsh-agent-mail-0.1.1.tgz` |
| Standalone UI | **Absent** (YAML 404 on `main`; live detail page 404) | **Would add** `...#dsh-agent-mail-ui`, category `ui`, tarball `dsh-agent-mail-ui-v0.1.7` / `dff652-dsh-agent-mail-ui-0.1.7.tgz` |

Live detail page (HTTP 200, last-modified 2026-09-08T14:20:59Z):
https://awesome-dsh-plugin.com/p/dff652/deepseek-harness-community-plugins--packages-dsh-agent-mail/

That page still installs the 0.1.0 GitHub Release tarball. It does not mention
0.1.7, 0.2.0 or a UI package.

### Duplicate UI listing

A duplicate UI catalog entry **does not exist today**. PR 4837 **would create
one** if merged as written: a new `ui` listing for standalone 0.1.7 beside the
MCP entry. That conflicts with this wave’s unified `@dff652/dsh-agent-mail@0.2.0`
package, which already includes the mailbox UI. Do not add
`dff652__deepseek-harness-community-plugins--packages-dsh-agent-mail-ui.yml`.

### Other catalogs checked

- GitHub topic `dsh-plugin` is present on
  https://github.com/dff652/deepseek-harness-community-plugins
  (`deepseek-harness`, `dsh-plugin`, `mcp`, `ai-asset-hub`). The provider repo
  https://github.com/dff652/agent-mail has **no** topics.
- [dshplugin.world](https://dshplugin.world/) is a separate GitHub-topic crawl
  with snapshot **2026-08-13** (29 packages). This repository was created
  2026-08-18T05:58:41Z, after that snapshot. Pages for
  `/plugins/deepseek-harness-community-plugins` and `/plugins/dsh-agent-mail`
  returned 404. Whether a later snapshot lists the package is **unverified**.
- The local `dff652/awesome-dsh-plugin` fork checkout is on the historical
  branch `add-dff652-agent-mail` (PR 2988), not PR 4837. Unrelated homelab
  hits for the number 4837 are not this pull request.

## 2. Remote tags, Releases and npm

Rechecked 2026-09-11 with `git ls-remote`, `gh release`, anonymous
`SHA256SUMS` downloads and `npm view`. No versions were changed.

### Provider `agent-mail` (`dff652/agent-mail`)

Public repo: https://github.com/dff652/agent-mail (public, default `main`,
last push 2026-09-11T01:48:40Z). The companion public source checkout is on
`codex/agent-mail-enrollment` at
`bdaa0fa673103d7b54a97bbc1ad6641b47bade34`
(`feat(mail): add durable sent receipts and authenticated agent details`),
one commit ahead of `origin/main` `307f9c0`. That commit is **not** on the
remote.

| Channel | Remote state | Local candidate |
|---|---|---|
| Git tags | Only `v1.0.0-alpha.6` → `307f9c03ad46c553430964cd30fb93b6b9b6935f` | `1.0.0-alpha.7` at `bdaa0fa`; **no** remote `v1.0.0-alpha.7` |
| GitHub Release | [v1.0.0-alpha.6](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.6) published 2026-09-11T01:52:54Z, prerelease, assets `agent-mail-1.0.0-alpha.6.tgz`, `agent-mail-1.0.0-alpha.6.sbom.cdx.json`, `SHA256SUMS` | Unreleased `agent-mail-1.0.0-alpha.7.tgz` |
| npm `agent-mail` | **404** | `publishConfig.access=public`, `tag=alpha` in package.json; not published |
| npm `@dff652/agent-mail` | **404** | Not used |

Remote `SHA256SUMS` for alpha.6 (downloaded 2026-09-11):

```text
3df7e5e837b14d21c51a2078583af3729fe2d2f8dda3feb177fdd916af43c4e9  agent-mail-1.0.0-alpha.6.sbom.cdx.json
2c3fed0a2a9830e3119869dffa89201ed4aa369486503459a1008f69e0a768be  agent-mail-1.0.0-alpha.6.tgz
```

Provider CI on remote `main` passed for alpha.6 (`34551888197`,
2026-09-11T01:44:44Z). The Release workflow for `v1.0.0-alpha.6` also passed
(`34552151078`, 2026-09-11T01:48:42Z). Alpha.7 has **no** remote CI because
`bdaa0fa` is unpushed.

### Bundles `@dff652/dsh-agent-mail` and `@dff652/dsh-agent-mail-ui`

Public repo: https://github.com/dff652/deepseek-harness-community-plugins.
Local `main` is **1 commit ahead** of `origin/main`:
`73699526ae7304c0f700bcd7ced6bd2a88380727`
(`feat(agent-mail): unify mailbox UI with durable sent receipts`).
`origin/main` is `08f7ea078565186933d29d5830a845b052ecdeca` (UI 0.1.7 /
MCP 0.1.1). Remote CI has not run for `7369952`.

| Tag | Target commit | GitHub Release | Published (UTC) |
|---|---|---|---|
| `dsh-agent-mail-v0.1.0` | `db1b729b3f3726cc79f4e45cb7301186d7487bde` | [v0.1.0](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.1.0) | 2026-08-24T07:20:03Z |
| `dsh-agent-mail-v0.1.1` | `08f7ea078565186933d29d5830a845b052ecdeca` | [v0.1.1](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.1.1) | 2026-09-11T01:53:04Z |
| `dsh-agent-mail-ui-v0.1.4` | `e179d893a15a71979e8c8a05919a691abe65d5d6` | [v0.1.4](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-ui-v0.1.4) | 2026-09-05T04:54:29Z |
| `dsh-agent-mail-ui-v0.1.7` | `08f7ea078565186933d29d5830a845b052ecdeca` | [v0.1.7](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-ui-v0.1.7) **Latest** | 2026-09-11T01:53:06Z |
| `dsh-agent-mail-v0.2.0` | **absent remotely** | **absent** | — |
| `dsh-agent-mail-ui-v0.1.8` | **absent remotely** | **absent** | — |

Anonymous `SHA256SUMS` downloads (2026-09-11):

```text
d571c170e1b156407d88ef5f9f0cdb688aaffc522fdf68b11798f4066b71869f  dff652-dsh-agent-mail-0.1.0.tgz
03664058d3a7c56d9a151f3a57091d06102d564f66b8cb2efe5f432fa5c18e0d  dff652-dsh-agent-mail-0.1.1.tgz
ed87f8fca7db9a153e0105a4c89c2b8dca2c108456c85bfb81024c85735fe1e9  dff652-dsh-agent-mail-ui-0.1.4.tgz
e45bdcd2ce9bcdfec0da1de7e5ea2d619ce0b2d6f4d3afa7e2646d7a1e0615c0  dff652-dsh-agent-mail-ui-0.1.7.tgz
```

npm `@dff652/dsh-agent-mail`, `@dff652/dsh-agent-mail-ui`, `dsh-agent-mail`
and `dsh-agent-mail-ui` are all **404**. Historical Releases used GitHub
tarballs with catalog `npm: null`.

Local package versions versus remotes:

| Package | Local `package.json` | Remote latest tag/Release | npm |
|---|---|---|---|
| `agent-mail` | `1.0.0-alpha.7` | `1.0.0-alpha.6` | none |
| `@dff652/dsh-agent-mail` | `0.2.0` | `0.1.1` | none |
| `@dff652/dsh-agent-mail-ui` | `0.1.8` | `0.1.7` | none |

### Version conflicts (report only; versions not changed)

- **No npm or tag collision** for `1.0.0-alpha.7`, `0.2.0` or UI `0.1.8`.
- **Catalog content conflict:** PR 4837 still describes MCP 0.1.1 + a **new**
  UI 0.1.7 listing. The live catalog still points at MCP **0.1.0** even though
  0.1.1 is already released. Merging 4837 as-is would publish a standalone UI
  slot this wave intends to keep compatibility-only.
- **Source lag:** plugin `0.2.0` and provider `1.0.0-alpha.7` are unpushed.
  Catalog tarball URLs for those versions cannot exist until GitHub Releases
  exist.
- **Multi-package Latest flag:** GitHub currently marks
  `dsh-agent-mail-ui-v0.1.7` as the repository Latest Release. A later
  `dsh-agent-mail-v0.2.0` Release may steal that badge unless `make_latest` is
  chosen deliberately.
- Standalone UI `0.1.8` is a local compatibility candidate, not a catalog
  target. Publishing it is a separate decision and is not required for 0.2.0.

### Proposed publish order (unexecuted)

Each step still needs its own owner authorization. Later steps must not be
inferred from earlier ones.

1. Coordinator reviews T1 evidence and confirms archive bytes are still the
   recorded digests. If package contents changed, rebuild, repack, rehash and
   re-run affected gates (T4). T2 did not pack.
2. Push the reviewed provider source including authorized documentation commits (current documentation head `6bdcc67`, product baseline `bdaa0fa`), and require remote CI to pass.
3. Create and push the authorized `v1.0.0-alpha.7` tag on the reviewed commit.
   The existing provider `.github/workflows/release.yml` runs gates, builds
   the tarball, CycloneDX SBOM and `SHA256SUMS`, attests the artifacts and
   creates a **draft** GitHub Release automatically. The current workflow
   includes SBOM generation; it is not an optional manual attachment.
   Wait for workflow success and inspect that existing draft; do not issue a
   second `gh release create` or race its artifact uploads. If a draft already
   exists after an interrupted run, inspect it and the run result before
   proceeding; do not delete or replace assets blindly.
   Verify the tag commit, all checksums, SBOM package/dependency inventory and
   provenance against the workflow. Download the draft tarball through
   authenticated access and require SHA-256
   `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98`.
   If bytes differ, stop: inspect the difference, record the new digest and
   re-run exact-artifact acceptance before requesting publication of those
   bytes. Do not silently overwrite the workflow artifact with a local file.
   With release-publication authorization, edit/publish the existing draft as
   a prerelease, retaining verified assets and provenance. Then verify an
   anonymous download digest and installation; draft access alone is not
   public-download acceptance.
4. npm `agent-mail@1.0.0-alpha.7` with dist-tag `alpha` only if separately
   authorized. Currently **unchosen**.
5. Push plugin `7369952` (and any authorized documentation commits). Require
   Node 22.19/24.19 CI.
6. Annotated tag `dsh-agent-mail-v0.2.0`. GitHub Release attaching
   `dff652-dsh-agent-mail-0.2.0.tgz` and `SHA256SUMS`. Verify anonymous
   download digest
   `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf`.
7. npm `@dff652/dsh-agent-mail@0.2.0` only if separately authorized.
   Currently **unchosen**.
8. Do **not** tag or Release standalone UI `0.1.8` as part of this catalog
   change. UI `0.1.7` already has a GitHub Release for two-package rollback.
9. After the 0.2.0 Release URL exists, update the **existing** MCP catalog
   YAML (see §5). Do not create a UI YAML. Do not comment on PR 4837 without
   authorization.
10. Production cutover is T5 and needs a separate production authorization
    after T3/T4.

Provider before plugin: unified 0.2.0 can install against older providers for
legacy mail tools, but sent receipts and recipient details require
`1.0.0-alpha.7`. Catalog after GitHub Release: the `tarball:` field must be a
GitHub-hosted `https` `.tgz`.

## 3. Candidate release notes

Draft only. Compatible provider: **`agent-mail@1.0.0-alpha.7`**. Compatible
Harness peer: `@deepseek-ai/dsh-mcp-client@0.1.1-rc.2`.

### New behavior

- **Unified package.** `@dff652/dsh-agent-mail@0.2.0` mounts one MCP child and
  the mailbox UI. A second UI install is not required and fails closed as a
  duplicate loader entry.
- **Durable sent receipts.** The UI shows sender-scoped sent history from
  provider `comm_sent`. Submit feedback is visible after send; later claim,
  completion and acknowledgement update the same rows.
- **Sender isolation.** Sent history is scoped to the authenticated sender.
  The Hub derives that identity from authentication, never a caller-supplied
  query identity. A stranger identity sees an empty sent/inbox set.
- **Task versus notification delivery.** Original task receipts use durable
  task state (`completed` / `failed` / acked). A later `done` or `error`
  notification keeps its own delivery receipt (`submitted` / pending). Hub
  transport acknowledgement is not proof that a recipient processed a
  message.
- **Unknown device fields.** Recipient identity, device name/IP and Hub
  address stay separate. Without trusted device registration and a heartbeat,
  device name/IP and continuous presence remain unknown. A recorded request
  time is an observation, not proof the client is still online. The UI must
  not infer an address from an identity suffix or the Hub URL.

### Two-host isolated acceptance

On 2026-09-11 Host A ran a disposable DSH web profile and an authenticated
TLS Hub. Host B used an independent MCP identity and mailbox home. Native
dependencies were installed on each host; `node_modules` was not copied. TLS
verification stayed enabled. Existing production and preview services were
not used as the candidate.

Independently verified (primary agent, not a worker summary): bidirectional
send, sender isolation, claim/done/error/ack, original-task versus
notification delivery, MCP restart, Hub disconnect fail-closed, Hub restart
recovery, and real-browser history after reload with automatic
claim/completion updates and truthful unknown device/connection fields.

The first Host B `type=error` call used a task origin and was rejected
(`done/error must be sent by the assignee to the task origin`). Retest as
assignee passed in both directions. Item-by-item evidence is in the
[cross-host closeout](agent-mail-acceptance-closeout.md). The requested Host B
`luna-worker` type was unavailable; a general-purpose worker used the same
ownership contract. That is not a claim that `luna-worker` ran.

### Known limits

- No trusted device-name/IP registration and no device heartbeat / continuous
  presence feed.
- Sent UI shows the most recent 50 messages. There is no older-page
  navigation yet, although the provider API has a stable pagination cursor.
- No automatic model wake, session injection or push delivery. No status in
  this UI wakes a model.
- Optional connection wizard still requires a separately configured
  authenticated management host. Installing the plugin does not provision a
  provider, credentials or a Hub.
- Network timeout “result unverified” UX and send idempotency remain backlog
  (U1).

### Migration and rollback pointers

Do not treat these links as a live cutover instruction. Machine-specific
commands belong in the T3 private handoff.

- Unified install/migration and one-MCP/one-UI rule:
  [agent-mail-unified-candidate.md](agent-mail-unified-candidate.md)
- Package README:
  [packages/dsh-agent-mail/README.md](../packages/dsh-agent-mail/README.md)
- Shared install/upgrade/rollback commands:
  [install-upgrade-rollback.md](install-upgrade-rollback.md)
- Historical two-package UI plan (0.1.4 live baseline, rollback homes):
  [agent-mail-ui-release-plan.md](agent-mail-ui-release-plan.md)
- Provider candidate record:
  provider `docs/acceptance/sent-receipts-alpha7.md` in
  https://github.com/dff652/agent-mail (local commit; not on `origin/main`
  until pushed)
- Production SOP (T3, unexecuted):
  [agent-mail-production-migration-plan.md](agent-mail-production-migration-plan.md)

Fresh profile: install only the unified 0.2.0 tarball. Existing two-package
profile: remove `@dff652/dsh-agent-mail-ui` before adding 0.2.0. Keep provider
home, identity and connection configuration. Plugin removal does not delete
the mailbox. Rollback restores the old MCP tarball and then the old
standalone UI tarball.

## 4. Archives, allowlists and gates

T2 did not repack. Digests and packed-file counts come from the 2026-09-11
acceptance records. Confirm allowlists from `package.json` `files` plus the
always-included `package.json`.

### Candidate archives

| Artifact | Version | Archive name | SHA-256 | Packed files |
|---|---|---|---|---:|
| Provider | `1.0.0-alpha.7` | `agent-mail-1.0.0-alpha.7.tgz` | `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98` | 117 |
| Unified plugin | `0.2.0` | `dff652-dsh-agent-mail-0.2.0.tgz` | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` | 9 |

Source commits bound to those archives: provider `bdaa0fa`, plugins
`7369952`.

### Allowlists (from `files`, not a new pack)

Unified `@dff652/dsh-agent-mail@0.2.0` (9 packed files):

```text
package.json
index.js
ui-host.js
client.js
view.js
cordis.patch.yml
README.md
LICENSE
NOTICE
```

Provider `agent-mail@1.0.0-alpha.7` roots (117 packed files under these
entries plus `package.json`):

```text
package.json
dist/
refs/
settings.json
npm-shrinkwrap.json
README.md
LICENSE
NOTICE
```

Standalone UI `files` (compatibility package, 8 files when packed; **not**
the 0.2.0 catalog artifact):

```text
package.json
index.js
client.js
view.js
cordis.patch.yml
README.md
LICENSE
NOTICE
```

Released MCP 0.1.1 on `origin/main` still allowlists only
`index.js`, `cordis.patch.yml`, `README.md`, `LICENSE`, `NOTICE` (6 packed
files). 0.2.0 adds `ui-host.js`, `client.js` and `view.js`.

### Final publish gates (T4; not run in T2)

From [AGENTS.md](../AGENTS.md) and [release-readiness.md](release-readiness.md):

1. `npm run check:repo` and package contract tests on the exact source
   commit.
2. `npm pack --dry-run --ignore-scripts`; unpacked set equals the allowlist.
3. Two clean packs byte-identical to the recorded SHA-256, or an explicit
   note that the already-hashed candidate was reused without a content
   change.
4. Exact packed tarball in a clean disposable DSH profile: one
   `mcp-agent-mail` row and one `dsh-agent-mail-ui` row naming
   `@dff652/dsh-agent-mail`; coinstall with standalone UI fails closed.
5. Anonymous GitHub Release download reproduces the digest; install those
   downloaded bytes, not the local pack path, before calling the Release
   accepted.
6. Provider Release: same digest check, 117-file match, installer/SBOM
   regressions if those assets are attached.
7. Record version, digest and acceptance pointers. Do not record secrets or
   user data.

### Evidence sources

| Claim | Source |
|---|---|
| Candidate digests and 117/9 file counts | [unified candidate](agent-mail-unified-candidate.md), [closeout](agent-mail-acceptance-closeout.md), provider `docs/acceptance/sent-receipts-alpha7.md` |
| Allowlists | `packages/dsh-agent-mail/package.json`, `packages/dsh-agent-mail-ui/package.json`, provider `packages/agent-mail/package.json` |
| Two-host matrix | closeout table; T1 owns remaining trace edits |
| Remote tags/Releases | `git ls-remote`, `gh release`, downloaded `SHA256SUMS` |
| npm absence | `npm view` 404 for each name above |
| Catalog PR | `gh pr view 4837 --repo awesome-dsh-plugin/awesome-dsh-plugin`, live YAML, live detail page |
| Historical gates | [release-readiness.md](release-readiness.md), [project-status.md](project-status.md) |

Protected local logs, TLS material and mailbox payloads are **not** copied
here.

## 5. Catalog change draft (unsubmitted)

Intent: one unified MCP+UI entry. Standalone UI stays a compatibility
package for old two-tarball installs. Do **not** create a duplicate UI
listing.

Keep filename
`data/plugins/dff652__deepseek-harness-community-plugins--packages-dsh-agent-mail.yml`
and name `dff652/deepseek-harness-community-plugins#dsh-agent-mail`. Keep
category `tools` unless maintainers recategorize. Do not add
`...-dsh-agent-mail-ui.yml`.

Draft YAML (tarball URL is valid only after the 0.2.0 GitHub Release exists):

```yaml
url: https://github.com/dff652/deepseek-harness-community-plugins/tree/main/packages/dsh-agent-mail
name: dff652/deepseek-harness-community-plugins#dsh-agent-mail
category: tools
description:
  en: Connects DeepSeek Harness to a deployment-owned Agent Mail MCP server, mounts one mailbox UI, and exposes send, inbox, sent receipts, recipient details, claim, acknowledgement, diagnostics and approval-discovery tools. Non-human identities cannot execute approval. The provider is installed separately. Automatic wake and trusted device presence are not included.
  zh: 将 DeepSeek Harness 连接到部署方管理的 Agent Mail MCP 服务，同时挂载一个邮箱界面，并提供发送、收件箱、已发送回执、收件人详情、认领、确认、诊断与审批发现工具。非人类身份不能执行审批。Provider 需另行安装。不包含自动唤醒或可信设备在线状态。
tarball: https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.0/dff652-dsh-agent-mail-0.2.0.tgz
```

Leave `npm` unset/`null` unless npm publication is authorized. Catalog
contributing rules require a GitHub Release-hosted `https` `.tgz` for the
`tarball:` field.

Do **not** ship PR 4837 as currently written. After 0.2.0 is released, either:

- update that PR in place: change the existing MCP YAML as above and **drop**
  the new UI YAML; or
- close it without merge (authorized comment/close only) and open a
  replacement that touches only the existing MCP file.

If 4837 merged first, a follow-up must delete the UI YAML and retarget the
MCP tarball to 0.2.0 so the storefront does not offer two mailbox UIs.

Site build on 4837 is already red because of unrelated `wwweljf` added-date
derivation. Expect the same base-branch failure until catalog maintainers
fix it; that is not solved by adding a UI listing.

## 6. GitHub Release archives versus npm

**GitHub Release archives are needed. npm is not required for this catalog
update and remains unexecuted.**

| Channel | Provider `1.0.0-alpha.7` | Unified plugin `0.2.0` | Standalone UI `0.1.8` |
|---|---|---|---|
| GitHub Release `.tgz` + `SHA256SUMS` | **Needed** (current public install path; alpha.6 already uses this) | **Needed** (catalog `tarball:` must be a GitHub Release asset; live listing already uses this) | Not part of this catalog change; 0.1.7 already released for rollback |
| npm registry | **Unchosen.** Package name is unpublished. `publishConfig.tag=alpha` only if authorized. | **Unchosen.** Catalog `npm: null`. Historical AIAH/Mail/UI Releases also skipped npm. | **Unchosen.** |

Catalog contributing.md recommends npm so storefronts can skip `allowBuilds`,
but it also accepts a GitHub Release tarball and **requires** that tarball
when the listing uses `tarball:`. This repository’s reviewed exact-byte
channel has always been the GitHub Release asset. The inspected dshmarket `1.41.0` implementation (`lib/sources.js`,
`installTargetFor`) prefers a valid npm name, then a repository-matched
GitHub Release `tarball`, and only then GitHub source. With `npm: null` and
the valid unified Release URL in the updated catalog, its target is the exact
Release archive. Catalog merge/cache refresh and actual installation still
need verification; installing the plugin does not upgrade the separate provider.

Do not treat a GitHub Release as npm publication, or npm as a catalog update.

## 7. Open questions

1. Update PR 4837 in place versus close-and-replace after the 0.2.0 Release
   URL exists. T2 did not comment.
2. Whether the owner wants npm for provider, plugin, both or neither.
3. Whether the catalog category stays `tools` or maintainers move the unified
   entry.
4. Whether `dsh-agent-mail-v0.2.0` should become GitHub Latest, leaving UI
   0.1.7 as a non-latest historical Release.
5. Provider SBOM is generated by the current release workflow. Any proposal to remove it requires a separately reviewed workflow change; this plan keeps it.
6. Whether to Release standalone UI 0.1.8 at all. Compatibility can keep using
   source plus the already-released 0.1.7 tarball.
7. Catalog site-build failure on unrelated `wwweljf` entries: maintainer
   exception versus waiting for a base-branch fix.
8. Remote CI for unpushed `bdaa0fa` and `7369952` is unverified.
9. `dshplugin.world` post-2026-08-13 snapshot: unverified.
10. Original T1–T3 documents were committed in plugins `9cd36ef` and provider `6bdcc67`. Subsequent review corrections are recorded in the current documentation revision; T4 must verify the final source commit before publication.

## Authorization boundary

This file is documentation. It does not upload archives, create tags,
publish npm packages, edit the catalog, comment on PRs, or migrate
production.
