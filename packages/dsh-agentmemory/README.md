# DSH AgentMemory bundle

Configuration-only DeepSeek Harness bundle for an already reviewed AgentMemory
stdio adapter. It mounts the official `@deepseek-ai/dsh-mcp-client` peer and
starts a deployment-owned command; it does not copy AgentMemory handlers,
store credentials, ship a provider binary, or capture sessions.

## Pinned combination

| Item | Pin |
|---|---|
| DeepSeek Harness | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-mcp-client` | `0.1.0-rc.6` |
| Reviewed AgentMemory server | `0.9.28` |
| Stdio adapter | Deployment-owned; not shipped here |

This repository chose adapter option A: the user supplies a reviewed stdio
command. See the
[adapter decision](../../docs/agentmemory-adapter-decision.md). Do not point
this bundle at an unreviewed `PATH` binary.

## Deployment contract

The DSH service must define `DSH_AGENTMEMORY_COMMAND` as a non-blank absolute
path to a reviewed stdio executable. A missing, blank or relative value is
rejected during activation; the bundle never asks the operating system to
resolve a provider through `PATH`.

A conforming adapter must require an explicit stable `project` on
`memory_save`. It must not invent a project from the DSH service working
directory. `memory_recall` should accept the same explicit project when the
caller needs isolation. Adapter URL, secret file and runtime data stay
outside this package.

Install an exact package version or reviewed tarball into a disposable DSH
profile first. A source checkout is not release acceptance.

```bash
dsh plugin --profile <profile> add -w ./dff652-dsh-agentmemory-0.1.0.tgz
dsh --profile <profile> --dump-config
```

Remove the bundle without deleting the separately managed AgentMemory service
or its memories:

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agentmemory
dsh --profile <profile> --dump-config
```

Keep the prior reviewed tarball and digest before an upgrade so the same
commands can restore it if acceptance fails.

### Configuration-only activation check

From a repository checkout, the package-specific DSH negative activation check
requires a reviewed DSH runtime and fails clearly if `dsh` is unavailable. The
script is intentionally kept out of the published five-file package. It uses
a temporary DSH home and never starts a provider or touches a live profile:

```bash
node tests/dsh-agentmemory-activation.acceptance.mjs
```

The check covers unset, blank and relative `DSH_AGENTMEMORY_COMMAND` values.
It is kept outside `npm test` because CI environments without DSH must not
silently skip real activation acceptance.

## Expected model-visible names

```text
mcp__agentmemory__memory_consolidate
mcp__agentmemory__memory_diagnose
mcp__agentmemory__memory_lesson_save
mcp__agentmemory__memory_recall
mcp__agentmemory__memory_reflect
mcp__agentmemory__memory_save
mcp__agentmemory__memory_sessions
mcp__agentmemory__memory_smart_search
```

The accepted business surface is recall plus explicit-project save and
cross-session recall. The other discovered tools are advertised because the
server exposes them; this bundle does not claim that every tool is
semantically accepted. Automatic prompt, tool-result and full-session capture
remain disabled.

## Package contract

The package declares `dsh.bundle.patch` in `package.json` and pins the official
MCP client as an exact peer dependency. Deployment-specific command paths,
endpoints and credentials stay outside this package.

The package includes its MIT [`LICENSE`](./LICENSE) so the license notice
travels with every independently distributed tarball.
