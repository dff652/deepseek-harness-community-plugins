<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="DeepSeek Harness Plugins connects DSH to reviewed configuration-only MCP bundles">
</p>

<p align="center">
  <a href="https://github.com/dff652/deepseek-harness-community-plugins/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dff652/deepseek-harness-community-plugins/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="AIAH candidate 0.1.1" src="https://img.shields.io/badge/AIAH-candidate%200.1.1-38bdf8">
  <img alt="Agent Mail candidate 0.1.0" src="https://img.shields.io/badge/Agent%20Mail-candidate%200.1.0-38bdf8">
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-8b9bb4"></a>
  <img alt="Node.js 22.19 or 24 and newer" src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-5fa04e">
</p>

Expose independently installed MCP providers inside DeepSeek Harness without
bundling provider code, data, credentials, or machine-specific paths. Each
package is a small configuration bundle with its own version and allowlist.

> [!IMPORTANT]
> `@dff652/dsh-ai-asset-hub@0.1.1` and `@dff652/dsh-agent-mail@0.1.0` are
> public source candidates. Neither package is tagged, released, published to
> npm, listed in a marketplace, or deployed to a live profile.

## What you get

| Package | Contract |
| --- | --- |
| `@dff652/dsh-ai-asset-hub` | Starts a deployment-owned `aiah mcp` process. Eight read-only tools. Five-file package. |
| `@dff652/dsh-agent-mail` | Starts a deployment-owned `agent-mail-mcp` process. Eleven tools with non-human approval denial. Six-file package including `NOTICE`. |

The bundles do **not** ship provider executables, copy provider handlers, store
credentials, start automatic wake, or inject sessions.

## Validate a local candidate

Pack from a reviewed checkout, record the resulting digest, and install only
that exact tarball into a disposable DSH profile:

```bash
npm pack --workspace @dff652/dsh-ai-asset-hub --ignore-scripts
sha256sum dff652-dsh-ai-asset-hub-0.1.1.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-ai-asset-hub-0.1.1.tgz

npm pack --workspace @dff652/dsh-agent-mail --ignore-scripts
sha256sum dff652-dsh-agent-mail-0.1.0.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-0.1.0.tgz

dsh --profile <profile> --dump-config
```

AIAH requires `DSH_AIAH_COMMAND` as the absolute path of a reviewed `aiah`
executable. Agent Mail requires absolute `DSH_AGENT_MAIL_COMMAND`,
`DSH_AGENT_MAIL_HOME` and a non-human `DSH_AGENT_MAIL_ID`. Neither bundle
resolves a provider through `PATH`.

## How the boundary works

```text
DeepSeek Harness profile
        │
        ├─ @dff652/dsh-ai-asset-hub      configuration only
        │          └─ DSH_AIAH_COMMAND mcp
        │
        └─ @dff652/dsh-agent-mail        configuration only
                   └─ DSH_AGENT_MAIL_COMMAND
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
```

AIAH writer tools such as build, apply, and rollback are intentionally absent.
Agent Mail advertises approval tools but a non-human Harness identity cannot
execute them.

## Verify from source

Run the portable repository and package checks:

```bash
npm run check:repo
npm test
npm pack --workspace @dff652/dsh-ai-asset-hub --dry-run --ignore-scripts
npm pack --workspace @dff652/dsh-agent-mail --dry-run --ignore-scripts
```

On a host with the reviewed DSH runtime, run the activation and process
lifecycle gates. These fail instead of silently skipping when `dsh` is absent:

```bash
npm run test:activation:aiah
npm run test:lifecycle:aiah
npm run test:activation:agent-mail
npm run test:lifecycle:agent-mail
npm run test:coexistence
```

For provider E2E acceptance, point the verifiers at separately reviewed
executables and disposable stores—never a personal provider home or live
profile:

```bash
npm run verify:aiah -- \
  --command /absolute/path/to/aiah \
  --testdata-root /absolute/path/to/disposable/aiah-testdata

npm run verify:agent-mail -- \
  --tarball /absolute/path/to/agent-mail-1.0.0-alpha.4.tgz
```

For installation, upgrade, removal and rollback procedures, see the
[consumer operations guide](./docs/install-upgrade-rollback.md). Release tags
are package-specific in this monorepo.

## Reviewed compatibility

| Component | Reviewed value |
| --- | --- |
| AIAH package | `@dff652/dsh-ai-asset-hub@0.1.1` candidate |
| Agent Mail package | `@dff652/dsh-agent-mail@0.1.0` source candidate |
| DeepSeek Harness | `0.1.0-rc.6` |
| MCP client | `@deepseek-ai/dsh-mcp-client@0.1.0-rc.6` |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| AI Asset Hub executable | Official Release `v0.1.11` |
| Agent Mail provider | `1.0.0-alpha.4` at commit `ca6601c` |

CI runs the portable contract on Node 22.19 and 24.19.

## Release state

| Transition | State |
| --- | --- |
| Clean repository and origin | AIAH source is on origin; Agent Mail source is local until a separate push |
| Public repository and `dsh-plugin` topic | Complete |
| Reviewed GitHub Release tarball | Not released |
| npm publication | Not published |
| Marketplace listing | Not submitted |
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
  official security review of AI Asset Hub or Agent Mail.
- Future providers must enter as separate workspaces after their own source,
  license, secret, artifact, and disposable-profile review.
- AgentMemory remains a future public-export scope. Automatic wake and
  automatic session capture are not claimed here.

Contributions are welcome within the documented public boundary. Start with
[CONTRIBUTING.md](./CONTRIBUTING.md), and report vulnerabilities according to
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
