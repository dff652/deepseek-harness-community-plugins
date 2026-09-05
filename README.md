<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="DeepSeek Harness Plugins connects DSH to reviewed configuration-only MCP bundles">
</p>

<p align="center">
  <a href="https://github.com/dff652/deepseek-harness-community-plugins/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dff652/deepseek-harness-community-plugins/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-ai-asset-hub-v0.1.1"><img alt="AIAH release 0.1.1" src="https://img.shields.io/badge/AIAH-release%200.1.1-5fa04e"></a>
  <a href="https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.1.0"><img alt="Agent Mail release 0.1.0" src="https://img.shields.io/badge/Agent%20Mail-release%200.1.0-5fa04e"></a>
  <img alt="Agent Mail UI candidate 0.1.4" src="https://img.shields.io/badge/Agent%20Mail%20UI-candidate%200.1.4-38bdf8">
  <img alt="AgentMemory candidate 0.1.1" src="https://img.shields.io/badge/AgentMemory-candidate%200.1.1-38bdf8">
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-8b9bb4"></a>
  <img alt="Node.js 22.19 or 24 and newer" src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-5fa04e">
</p>

Expose independently installed MCP providers inside DeepSeek Harness without
bundling provider code, data, credentials, or machine-specific paths. Each
package is a small configuration bundle with its own version and allowlist.

> [!IMPORTANT]
> `@dff652/dsh-ai-asset-hub@0.1.1` has a reviewed GitHub Release with an exact
> tarball and `SHA256SUMS`. `@dff652/dsh-agent-mail@0.1.0` now has the same
> reviewed Release boundary; its marketplace submission is open as
> [awesome-dsh-plugin#2988](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2988)
> with both automated checks passing. A separate clean-room
> `@dff652/agentmemory-mcp-adapter@0.1.0` local source candidate now passes its
> security, exact-pack, AgentMemory 0.9.28 and disposable DSH gates. It is not
> yet a public repository or Release, so `@dff652/dsh-agentmemory@0.1.0`
> is superseded by the current `@dff652/dsh-agentmemory@0.1.1` source
> candidate below. The AIAH marketplace entry from
> [awesome-dsh-plugin#2957](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2957)
> is merged and visible in the public catalog. No package is published to npm
> via this repository. Current live-use observations are tracked separately below.

HEAD also carries new DSH `0.1.1-rc.2` compatibility candidates:
`@dff652/dsh-ai-asset-hub@0.1.2`, `@dff652/dsh-agent-mail@0.1.1`,
`@dff652/dsh-agent-mail-ui@0.1.4` and `@dff652/dsh-agentmemory@0.1.1`. They
are unreleased source candidates. Earlier UI 0.1.2 was observed live; UI
0.1.4 has not been deployed. Source, release and live-use states are tracked
separately in [project status](docs/project-status.md).
The disposable install/config/remove evidence is recorded in
[`docs/dsh-0.1.1-rc.2-compatibility.md`](./docs/dsh-0.1.1-rc.2-compatibility.md),
with newer UI evidence in [UI acceptance](docs/agent-mail-ui-0.1.4-acceptance.md).
The [full-range UI review and release plan](docs/agent-mail-ui-release-plan.md)
records the completed local gates and the remaining release/upgrade steps.

## What you get

| Package | Contract |
| --- | --- |
| `@dff652/dsh-ai-asset-hub` | Starts a deployment-owned `aiah mcp` process. Eight read-only tools. Five-file package. |
| `@dff652/dsh-agent-mail` | Starts a deployment-owned `agent-mail-mcp` process. Eleven tools with non-human approval denial. Six-file package including `NOTICE`. |
| `@dff652/dsh-agent-mail-ui` | Optional host/client mailbox tab for the existing Agent Mail MCP namespace. Does not spawn a second MCP child. |
| `@dff652/dsh-agentmemory` | Starts a deployment-owned AgentMemory stdio adapter. Exact eight tools. Five-file package. Users supply the reviewed adapter. |

The bundles do **not** ship provider executables, copy provider handlers, store
credentials, start automatic wake, or inject sessions.

## Validate a local candidate

Pack from a reviewed checkout, record the resulting digest, and install only
that exact tarball into a disposable DSH profile:

```bash
npm pack --workspace @dff652/dsh-ai-asset-hub --ignore-scripts
sha256sum dff652-dsh-ai-asset-hub-0.1.2.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-ai-asset-hub-0.1.2.tgz

npm pack --workspace @dff652/dsh-agent-mail --ignore-scripts
sha256sum dff652-dsh-agent-mail-0.1.1.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-0.1.1.tgz

npm pack --workspace @dff652/dsh-agent-mail-ui --ignore-scripts
sha256sum dff652-dsh-agent-mail-ui-0.1.4.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-ui-0.1.4.tgz

npm pack --workspace @dff652/dsh-agentmemory --ignore-scripts
sha256sum dff652-dsh-agentmemory-0.1.1.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agentmemory-0.1.1.tgz

dsh --profile <profile> --dump-config
```

AIAH requires `DSH_AIAH_COMMAND` as the absolute path of a reviewed `aiah`
executable. Agent Mail requires absolute `DSH_AGENT_MAIL_COMMAND`,
`DSH_AGENT_MAIL_HOME` and a non-human `DSH_AGENT_MAIL_ID`. AgentMemory
requires absolute `DSH_AGENTMEMORY_COMMAND` pointing at a reviewed stdio
adapter; this repository does not ship that adapter. None of the bundles
resolve a provider through `PATH`.

## How the boundary works

```text
DeepSeek Harness profile
        │
        ├─ @dff652/dsh-ai-asset-hub      configuration only
        │          └─ DSH_AIAH_COMMAND mcp
        │
        ├─ @dff652/dsh-agent-mail        configuration only
        │          └─ DSH_AGENT_MAIL_COMMAND
        │
        ├─ @dff652/dsh-agent-mail-ui     host/client mailbox tab
        │          └─ reuses mcp__agent-mail__* (no second child)
        │
        └─ @dff652/dsh-agentmemory       configuration only
                   └─ DSH_AGENTMEMORY_COMMAND
```

Provider binaries, identities, homes, endpoints, credentials, and runtime data
remain outside the packages. MCP annotations are descriptive metadata rather
than a permission system.

## Model-visible tool contracts

```text
mcp__aiah__aiah_asset_status
mcp__aiah__aiah_diff
mcp__aiah__aiah_doctor
mcp__aiah__aiah_migration_readiness
mcp__aiah__aiah_migration_status
mcp__aiah__aiah_scan
mcp__aiah__aiah_validate
mcp__aiah__aiah_version

mcp__agent-mail__comm_send
mcp__agent-mail__comm_inbox
mcp__agent-mail__comm_claim
mcp__agent-mail__comm_ack
mcp__agent-mail__comm_list_agents
mcp__agent-mail__comm_approve
mcp__agent-mail__comm_reject
mcp__agent-mail__comm_approvals
mcp__agent-mail__comm_tail
mcp__agent-mail__comm_events
mcp__agent-mail__comm_diagnose

mcp__agentmemory__memory_consolidate
mcp__agentmemory__memory_diagnose
mcp__agentmemory__memory_lesson_save
mcp__agentmemory__memory_recall
mcp__agentmemory__memory_reflect
mcp__agentmemory__memory_save
mcp__agentmemory__memory_sessions
mcp__agentmemory__memory_smart_search
```

AIAH writer tools such as build, apply, and rollback are intentionally absent.
Agent Mail advertises approval tools but a non-human Harness identity cannot
execute them. AgentMemory advertises eight tools; the accepted business
surface is recall plus explicit-project save. Automatic session capture is
not enabled.

## Verify from source

Run the portable repository and package checks:

```bash
npm run check:repo
npm test
npm pack --workspace @dff652/dsh-ai-asset-hub --dry-run --ignore-scripts
npm pack --workspace @dff652/dsh-agent-mail --dry-run --ignore-scripts
npm pack --workspace @dff652/dsh-agentmemory --dry-run --ignore-scripts
npm pack --workspace @dff652/dsh-agent-mail-ui --dry-run --ignore-scripts
```

On a host with the reviewed DSH runtime, run the activation and process
lifecycle gates. These fail instead of silently skipping when `dsh` is absent:

```bash
npm run test:activation:aiah
npm run test:lifecycle:aiah
npm run test:activation:agent-mail
npm run test:lifecycle:agent-mail
npm run test:activation:agent-mail-ui
npm run test:clean-profile:agent-mail-ui
npm run test:activation:agentmemory
npm run test:lifecycle:agentmemory
npm run test:clean-profile:agentmemory
npm run test:coexistence
```

For UI browser and real MCP interaction checks, see
[Agent Mail UI acceptance](docs/agent-mail-ui-0.1.4-acceptance.md).

For provider E2E acceptance, point the verifiers at separately reviewed
executables and disposable stores—never a personal provider home or live
profile:

```bash
npm run verify:aiah -- \
  --command /absolute/path/to/aiah \
  --testdata-root /absolute/path/to/disposable/aiah-testdata

npm run verify:agent-mail -- \
  --tarball /absolute/path/to/agent-mail-1.0.0-alpha.4.tgz

npm run verify:agentmemory -- \
  --command /absolute/path/to/agentmemory-stdio-adapter \
  --check-save-requires-project

npm run test:real-mcp:agentmemory
```

> [!WARNING]
> `test:real-mcp:agentmemory` is a write-producing acceptance test. It saves
> three expected canaries in the dedicated `dsh-public-bundle-canary` project
> and three cross-project decoys in `dsh-public-bundle-other` (one per marker).
> The reviewed eight-tool provider has no delete operation, so the test cannot
> remove those observations. Run it only against an explicitly disposable
> AgentMemory store, never a personal or production memory store. Routine
> rechecks should use `verify:agentmemory` with reviewed existing canaries
> instead. Ad-hoc
> `--query`/`--expect` mode is a content smoke test: all expected terms must
> occur in one observation, but it does not certify project isolation. Strong
> isolation evidence requires a version 1 benchmark with an expected
> observation ID and, when responses omit `project`, a known cross-project
> `forbiddenObservationIds` canary for every case.

For installation, upgrade, removal and rollback procedures, see the
[consumer operations guide](./docs/install-upgrade-rollback.md). Release tags
are package-specific in this monorepo.

Verify the live catalog and exact Release bytes. Listing-only mode deliberately
returns `NOT_COVERED` with exit code 2 because it does not install anything:

```bash
npm run verify:marketplace:aiah -- --listing-only

npm run verify:marketplace:aiah -- \
  --dsh-bin /absolute/path/to/dsh \
  --aiah-command /absolute/path/to/aiah \
  --pnpm-cli /absolute/path/to/pnpm.mjs \
  --report /absolute/path/to/report.json
```

Full mode pins DSH `0.1.0-rc.6` and pnpm `11.7.0`, downloads and hashes the
catalog tarball once, installs those same bytes from a local temporary file,
checks the installed manifest, then removes the bundle and its package
directory. `DSH_HOME`, the consumer home, caches and the pnpm store are all
test-owned temporary paths. This proves catalog discovery plus disposable DSH
install/remove; it does not claim a browser click or live-profile deployment.

Verify the installation route used by the reviewed dshmarket `1.10.1` web
backend separately:

```bash
npm run verify:marketplace:aiah:backend -- \
  --dsh-bin /absolute/path/to/dsh \
  --pnpm-cli /absolute/path/to/pnpm.cjs \
  --aiah-command /absolute/path/to/reviewed/aiah \
  --report /absolute/path/to/report.json
```

This verifier starts only disposable profiles and caches, fetches the live
registry, sends the same-origin backend request used by the UI, binds the
resolved source commit to the installed lockfile, checks restart activation
and the exact reviewed provider executable, then uninstalls and proves cleanup
and non-resurrection. The current catalog record has `npm: null`, so this
backend route installs the repository source target rather than the Release
tarball. The report therefore records `sourceInstall: true` and
`exactReleaseArtifact: false`. It does not claim a literal browser DOM click,
model-visible L5 use, or a live-profile change.

## Reviewed compatibility

| Component | Reviewed value |
| --- | --- |
| Published AIAH artifact | `@dff652/dsh-ai-asset-hub@0.1.1` GitHub Release; historical rc.6 evidence |
| HEAD AIAH candidate | `@dff652/dsh-ai-asset-hub@0.1.2`; rc.2 compatibility evidence |
| Published Agent Mail artifact | `@dff652/dsh-agent-mail@0.1.0` GitHub Release; historical rc.6 evidence |
| HEAD Agent Mail candidate | `@dff652/dsh-agent-mail@0.1.1`; rc.2 compatibility evidence |
| HEAD Agent Mail UI candidate | `@dff652/dsh-agent-mail-ui@0.1.4`; task interaction fixes; [acceptance evidence](docs/agent-mail-ui-0.1.4-acceptance.md) |
| HEAD AgentMemory candidate | `@dff652/dsh-agentmemory@0.1.1`; rc.2 compatibility evidence |
| DeepSeek Harness | `0.1.1-rc.2` for HEAD candidates |
| MCP client | `@deepseek-ai/dsh-mcp-client@0.1.1-rc.2` for HEAD candidates |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| AI Asset Hub executable | Official Release `v0.1.11` |
| Agent Mail provider | `1.0.0-alpha.4` at commit `ca6601c` |
| AgentMemory adapter | `@dff652/agentmemory-mcp-adapter@0.1.0` reviewed local commit `c0656eb`; not yet pushed, public or released |
| AgentMemory server | Exact `0.9.28`, attested after adapter startup preflight |

CI runs the portable contract on Node 22.19 and 24.19.

## Release state

| Transition | State |
| --- | --- |
| Clean repository and origin | AIAH, Agent Mail and AgentMemory public source are on `origin/main` |
| Public repository and `dsh-plugin` topic | Complete |
| AIAH GitHub Release | [`dsh-ai-asset-hub-v0.1.1`](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-ai-asset-hub-v0.1.1); exact tarball and `SHA256SUMS` verified |
| Agent Mail GitHub Release | [`dsh-agent-mail-v0.1.0`](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.1.0); exact tarball and `SHA256SUMS` verified |
| AgentMemory GitHub Release | Adapter implementation/real acceptance complete locally; blocked pending separately authorized adapter repository publication and Release |
| npm publication | Not published |
| Marketplace listing | AIAH listed after merged [#2957](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2957); Agent Mail [#2988](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2988) open with both checks passing; AgentMemory waits for public adapter bytes and bundle Release |
| Model-visible L5 acceptance | Not claimed |
| Live-profile deployment | Not part of this repository |

Read the full [release-readiness record](./docs/release-readiness.md) for exact
digests, environment evidence, remaining gates, and the rule that publication
and deployment transitions require separate authorization.
The [project status matrix](./docs/project-status.md) separates implementation,
public export, GitHub Release, npm, marketplace and live-deployment states for
the current and planned providers.

## Project notes

- This is an independent project, not an official DeepSeek project or an
  official security review of AI Asset Hub, Agent Mail or AgentMemory.
- Future providers must enter as separate workspaces after their own source,
  license, secret, artifact, and disposable-profile review.
- AgentMemory users supply a reviewed stdio adapter. The separately maintained
  public-adapter candidate remains outside this bundle. Automatic wake and
  automatic session capture are not claimed here.

Contributions are welcome within the documented public boundary. Start with
[CONTRIBUTING.md](./CONTRIBUTING.md), and report vulnerabilities according to
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
