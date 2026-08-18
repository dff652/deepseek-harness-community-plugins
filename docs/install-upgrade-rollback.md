# Install, upgrade and rollback

This runbook covers the independently versioned bundles in this repository. It
does not install provider products and does not authorize a live deployment.

## Shared preconditions

- Use a reviewed DeepSeek Harness version compatible with each package's exact
  MCP client peer dependency.
- Install the separately reviewed provider executable and verify its
  publisher-provided checksum.
- Keep each candidate tarball and its SHA-256 together. Never install a file
  whose digest differs from the reviewed release record.
- Start in a disposable profile before considering a shared profile.

## AI Asset Hub

Set `DSH_AIAH_COMMAND` in the DSH service environment to the reviewed `aiah`
executable's absolute path. Do not rely on `PATH`.

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

```bash
dsh plugin --profile <profile> remove @dff652/dsh-ai-asset-hub
dsh plugin --profile <profile> add -w ./dff652-dsh-ai-asset-hub-<new-version>.tgz
dsh --profile <profile> --dump-config
```

```bash
dsh plugin --profile <profile> remove @dff652/dsh-ai-asset-hub
dsh --profile <profile> --dump-config
```

## Agent Mail

Set these DSH service variables before activation:

| Variable | Role |
|---|---|
| `DSH_AGENT_MAIL_COMMAND` | Absolute reviewed `agent-mail-mcp` |
| `DSH_AGENT_MAIL_HOME` | Absolute initialized Agent Mail home |
| `DSH_AGENT_MAIL_ID` | Distinct non-human identity, never `human@local` |
| `DSH_AGENT_MAIL_HUB_URL` | Optional remote Hub URL |

Initialize a disposable project with `agent-mail init --path /absolute/path/to/project`
and point `DSH_AGENT_MAIL_HOME` at the initialized home that command created.
Do not put a bearer token, certificate or provider data directory in the
package or a committed patch.

```bash
sha256sum dff652-dsh-agent-mail-0.1.0.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-0.1.0.tgz
dsh --profile <profile> --dump-config
```

The composed config must contain the bundle exactly once, with `serverName:
agent-mail` and the environment-backed command, home and identity checks.
Confirm the exact eleven-tool namespace, then run send/inbox/claim/done/ack on
a disposable store. A non-human Harness identity must be denied when it calls
`comm_approve` or `comm_reject`.

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agent-mail
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-<new-version>.tgz
dsh --profile <profile> --dump-config
```

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agent-mail
dsh --profile <profile> --dump-config
```

## AgentMemory

Set `DSH_AGENTMEMORY_COMMAND` in the DSH service environment to the reviewed
stdio adapter's absolute path. Do not rely on `PATH`. This repository does
not ship the adapter; the adapter owns the AgentMemory URL, secret file and
explicit-project save policy. See the
[adapter decision](./agentmemory-adapter-decision.md).

```bash
sha256sum dff652-dsh-agentmemory-0.1.0.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agentmemory-0.1.0.tgz
dsh --profile <profile> --dump-config
```

The composed config must contain the bundle exactly once, with `serverName:
agentmemory` and the environment-backed command validation expression.
Confirm the exact eight-tool namespace. A conforming adapter must reject
`memory_save` without an explicit project and must not write. Automatic
session capture is not part of this bundle.

From a repository checkout, the disposable-profile install check is:

```bash
node tests/dsh-agentmemory-clean-profile.acceptance.mjs
```

It packs the exact candidate, installs it once into disposable `web` and
`headless` profiles, starts the child, removes the bundle, and confirms no
provider process remains. It never touches a live profile.

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agentmemory
dsh plugin --profile <profile> add -w ./dff652-dsh-agentmemory-<new-version>.tgz
dsh --profile <profile> --dump-config
```

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agentmemory
dsh --profile <profile> --dump-config
```

Removing the bundle does not delete AgentMemory observations. Deleting
long-lived memories is a separate data-governance operation on the
AgentMemory service.

## Coexistence

The bundles may share one disposable profile when their namespaces and
provider commands remain distinct. Agent Mail also needs a distinct
non-human identity. Remove AIAH first, then Agent Mail, then AgentMemory,
and confirm that the config rows and provider children are gone.

The provider executables and their data are deployment-owned and are not
deleted by removing these bundles. Do not delete provider state as part of
plugin rollback.

## Release naming

This is a multi-package repository. Tags are package-specific:

```text
dsh-ai-asset-hub-v0.1.1
dsh-agent-mail-v0.1.0
dsh-agentmemory-v0.1.0
```

A release must attach the exact reviewed `.tgz` and `SHA256SUMS`. npm
publication, marketplace submission and live-profile installation remain
separate owner-controlled transitions.
