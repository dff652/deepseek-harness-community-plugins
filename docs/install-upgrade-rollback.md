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

The commands below use the current candidates: AIAH `0.1.2`, Agent Mail
`0.1.1`, Agent Mail UI `0.1.4` and AgentMemory `0.1.1`. The previously published AIAH `0.1.1` and
Agent Mail `0.1.0` artifacts remain immutable historical release bytes.

## AI Asset Hub

Set `DSH_AIAH_COMMAND` in the DSH service environment to the reviewed `aiah`
executable's absolute path. Do not rely on `PATH`.

```bash
sha256sum dff652-dsh-ai-asset-hub-0.1.2.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-ai-asset-hub-0.1.2.tgz
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
sha256sum dff652-dsh-agent-mail-0.1.1.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-0.1.1.tgz
dsh --profile <profile> --dump-config
```

For a repository-side recheck of downloaded Release bytes, provide both the
absolute artifact path and its reviewed digest; supplying only one fails
closed and symbolic-link artifacts are rejected:

```bash
DSH_AGENT_MAIL_PLUGIN_TARBALL=/absolute/path/to/dff652-dsh-agent-mail-0.1.0.tgz \
DSH_AGENT_MAIL_PLUGIN_SHA256=d571c170e1b156407d88ef5f9f0cdb688aaffc522fdf68b11798f4066b71869f \
DSH_AGENT_MAIL_TARBALL=/absolute/path/to/reviewed/agent-mail-1.0.0-alpha.4.tgz \
DSH_BIN=/absolute/path/to/dsh \
node tests/dsh-agent-mail-lifecycle.acceptance.mjs
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
not ship or auto-install the adapter. The separately maintained
`@dff652/agentmemory-mcp-adapter` candidate additionally requires absolute
`AGENTMEMORY_SECRET_FILE`, exact `AGENTMEMORY_PROJECT_ID` and
`AGENTMEMORY_URL`; non-loopback URLs must use HTTPS. Run its `--check` before
starting DSH. See the
[adapter decision](./agentmemory-adapter-decision.md).

```bash
agentmemory-mcp-adapter --check
sha256sum dff652-dsh-agentmemory-0.1.1.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agentmemory-0.1.1.tgz
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

## Agent Mail UI

For the current review findings, runtime compatibility gate, release order
and live rollback requirements, first read the
[UI release and upgrade plan](agent-mail-ui-release-plan.md). The commands
below are not an instruction to upgrade the existing live installation.

This package does not start `agent-mail-mcp`. It reuses an already registered
`mcp__agent-mail__*` namespace. Missing MCP tools do not fail DSH startup; the
panel reports offline. With `dsh-better-sidebar` it registers a mailbox tab.
Without that sidebar it uses a standalone bottom-right drawer. The two hosts
are exclusive.

```bash
sha256sum dff652-dsh-agent-mail-ui-0.1.4.tgz
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-ui-0.1.4.tgz
dsh --profile <profile> --dump-config
```

The composed config must contain `id: dsh-agent-mail-ui` exactly once. With
better-sidebar, open the existing right-hand workbench, then `+` → Agent
Mail. Without it, use the bottom-right mail control. Do not expect a new
top-right window icon.

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agent-mail-ui
dsh --profile <profile> --dump-config
```

Removing the UI does not remove `@dff652/dsh-agent-mail` or mailbox data.

## Coexistence

The bundles may share one disposable profile when their namespaces and
provider commands remain distinct. Agent Mail also needs a distinct
non-human identity. Remove AIAH first, then Agent Mail UI, then Agent Mail,
then AgentMemory, and confirm that the config rows and provider children are
gone.

The provider executables and their data are deployment-owned and are not
deleted by removing these bundles. Do not delete provider state as part of
plugin rollback.

## Release naming

This is a multi-package repository. Tags are package-specific:

The UI tag below is a planned name, not an existing Release.

```text
dsh-ai-asset-hub-v0.1.1
dsh-agent-mail-v0.1.0
dsh-agent-mail-ui-v0.1.4
dsh-agentmemory-v0.1.0
```

A release must attach the exact reviewed `.tgz` and `SHA256SUMS`. npm
publication, marketplace submission and live-profile installation remain
separate owner-controlled transitions.
