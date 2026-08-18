# Install, upgrade and rollback

This runbook covers the `@dff652/dsh-ai-asset-hub` bundle. It does not install
AI Asset Hub itself and does not authorize a live deployment.

## Preconditions

- Use a reviewed DeepSeek Harness version compatible with the package's exact
  MCP client peer dependency.
- Install the separately reviewed AI Asset Hub executable and verify its
  publisher-provided checksum.
- Set `DSH_AIAH_COMMAND` in the DSH service environment to that executable's
  absolute path. Do not rely on `PATH`.
- Keep the candidate tarball and its SHA-256 together. Never install a file
  whose digest differs from the reviewed release record.

## Install an exact tarball

Start in a disposable profile before considering a shared profile:

```bash
sha256sum dff652-dsh-ai-asset-hub-0.1.1.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-ai-asset-hub-0.1.1.tgz
dsh --profile <profile> --dump-config
```

The composed config must contain the bundle exactly once, with `serverName:
aiah`, the environment-backed command validation expression and the single
`mcp` argument. `--dump-config` does not expand the protected environment into
an absolute path; verify the service's `DSH_AIAH_COMMAND` value separately.
Start DSH and confirm the exact eight-tool namespace before running safe
read-only calls.

## Upgrade

Retain the previously accepted tarball and digest. Pack or download the new
candidate, verify it independently, then replace the package explicitly:

```bash
dsh plugin --profile <profile> remove @dff652/dsh-ai-asset-hub
dsh plugin --profile <profile> add -w ./dff652-dsh-ai-asset-hub-<new-version>.tgz
dsh --profile <profile> --dump-config
```

Repeat initialization, exact-tool, real-call, reconnect and provider-cleanup
checks. An upgrade is incomplete until the previous version can be restored.

## Remove or roll back

To remove the integration:

```bash
dsh plugin --profile <profile> remove @dff652/dsh-ai-asset-hub
dsh --profile <profile> --dump-config
```

Confirm that the bundle line and `aiah` namespace are absent and that no
provider child remains. To roll back, verify the retained previous tarball's
digest and add it with `dsh plugin --profile <profile> add -w <tarball>`, then
repeat the same acceptance checks.

The provider executable and its data are deployment-owned and are not deleted
by removing this bundle. Do not delete provider state as part of plugin
rollback.

## Release naming

This is a multi-package repository. Tags are package-specific:

```text
dsh-ai-asset-hub-v0.1.1
```

A release must attach the exact reviewed `.tgz` and `SHA256SUMS`. npm
publication, marketplace submission and live-profile installation remain
separate owner-controlled transitions.
