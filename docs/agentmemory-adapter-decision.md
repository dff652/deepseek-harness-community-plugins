# AgentMemory stdio adapter decision

Status: accepted.
Date: 2026-08-18.

## Decision

Choose option A: a public `@dff652/dsh-agentmemory` bundle starts only a
deployment-owned, already reviewed stdio command through
`DSH_AGENTMEMORY_COMMAND`. This repository does not copy the private adapter,
does not ship a provider executable, and does not publish a portable
AgentMemory adapter.

Option B, a separately maintained public adapter, remains a future product
decision in its own project. It is not part of this configuration-only
candidate.

## Why A

AgentMemory 0.9.28 is a separately deployed service. DeepSeek Harness talks to
it through stdio MCP, so a host must supply an adapter or other reviewed stdio
entry. The working private integration already follows that split: the private
bundle is configuration only, and the adapter that owns URL lookup, secret
files and project-isolation policy stays outside the package.

This public monorepo has the same boundary as the AIAH and Agent Mail
candidates. `AGENTS.md` keeps provider implementations, homes, endpoints and
credentials in their own projects. The private adapter is host-specific: it
resolves deployment secrets, speaks the service protocol and refuses to infer
`project` from the DSH process working directory. Copying it would import
private paths and secret-handling into a clean-history public tree.

A new portable adapter would still be provider-side software. It would need
its own license, secret-file contract, protocol review, release digest and
security process. Publishing that work from this repository would change the
product from a configuration bundle into an unofficial AgentMemory client.
That is option B, and it is out of scope until the owner authorizes a
separate project.

## Adapter contract

A conforming command must:

1. Be an absolute executable path. This bundle never resolves a provider
   through `PATH`.
2. Speak MCP over stdio with `shell: false` and no interpolated shell string.
3. Advertise exactly the eight reviewed tools.
4. Require an explicit non-empty `project` on `memory_save`. Missing, blank or
   cwd-derived project values must fail closed and must not write.
5. Accept an explicit `project` on `memory_recall` so callers can isolate a
   workspace. Unscoped recall is an adapter policy, not a way to invent a
   project name from the DSH service directory.
6. Keep the AgentMemory URL, secret file, bearer token and runtime database
   outside this package, its patch and its packed tarball.
7. Leave automatic prompt, tool-result and full-session capture disabled.

The public package documents this contract and tests it with a fixture-only
stdio double. The double is not a portable adapter and is not packed.

## What this package ships

The installable allowlist is exactly:

```text
package.json
index.js
cordis.patch.yml
README.md
LICENSE
```

The official MCP client is an exact peer dependency. Activation rejects an
unset, blank or relative `DSH_AGENTMEMORY_COMMAND`. Duplicate
`serverName: agentmemory` fails closed.

## What this package does not ship

- the private wrapper or adapter, their Git history, or their digests
- AgentMemory server code, binaries, URL, secret, observation IDs or user
  memory content
- automatic session capture
- a claim that every discovered tool is a semantically accepted business
  surface

Recall, explicit-project save and cross-session marker recall are accepted
against a conforming adapter. Automatic capture remains disabled.
