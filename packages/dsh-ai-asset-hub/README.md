# DSH AI Asset Hub bundle

Configuration-only DeepSeek Harness bundle for an already installed AI Asset
Hub executable. It mounts the official `@deepseek-ai/dsh-mcp-client` peer and
starts a deployment-owned `aiah mcp` command; it does not copy AIAH handlers,
store credentials, ship a provider binary or expose build/apply/rollback.

## Deployment contract

The DSH service must define `DSH_AIAH_COMMAND` as a non-blank absolute path to
a reviewed `aiah` executable. A missing, blank or relative value is rejected
during activation; the bundle never asks the operating system to resolve a
provider command through `PATH`. That executable, its version and its SHA-256
belong to the deployment, not this package. The package always passes `mcp` as
the only argument.

Install an exact package version or reviewed tarball into a disposable DSH
profile first. A source checkout is not release acceptance.

### Configuration-only activation check

From a repository checkout, the package-specific DSH negative activation check
requires a reviewed DSH runtime and fails clearly if `dsh` is unavailable. The
script is intentionally kept out of the published five-file package. It uses
a temporary DSH home and never starts a provider or touches a live profile:

```bash
node tests/dsh-ai-asset-hub-activation.acceptance.mjs
```

The check covers unset, blank and relative `DSH_AIAH_COMMAND` values. It is
kept outside `npm test` because CI environments without DSH must not silently
skip real activation acceptance.

## Reviewed tool names

```text
mcp__aiah__aiah_asset_status
mcp__aiah__aiah_diff
mcp__aiah__aiah_doctor
mcp__aiah__aiah_migration_readiness
mcp__aiah__aiah_migration_status
mcp__aiah__aiah_scan
mcp__aiah__aiah_validate
mcp__aiah__aiah_version
```

The accepted candidate is read-only. Provider-side tests remain authoritative
for the zero-write invariant because DSH does not turn MCP annotations such as
`readOnlyHint` into an authorization system.

## Package contract

The package declares `dsh.bundle.patch` in `package.json` and pins the official
MCP client as an exact peer dependency. Deployment-specific command paths,
provider homes, endpoints and credentials stay outside this package.

The package includes its MIT [`LICENSE`](./LICENSE) so the license notice
travels with every independently distributed tarball.
