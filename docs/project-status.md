# Project status

Status date: 2026-08-18.

This matrix separates implementation, private deployment, public source,
GitHub Release, npm publication, marketplace listing and live deployment.
Those transitions are not interchangeable and each external publication step
requires owner authorization.

## Summary

| Bundle | Implementation | Public source | GitHub Release | npm | Marketplace | Live use |
|---|---|---|---|---|---|---|
| `@dff652/dsh-ai-asset-hub@0.1.1` | Complete | Complete | Released | Not published | Not eligible yet | Separate decision |
| `@dff652/dsh-agent-mail@0.1.0` | Private candidate validated | Public source on origin; not released | None | Not published | Not submitted | Not installed by this project |
| `@dff652/dsh-agentmemory@0.1.0` | Private integration active; public candidate implemented | Public source candidate; not pushed | None | Not published | Not submitted | Private deployment remains separate; public package not installed live |

## AI Asset Hub

The AI Asset Hub bundle has passed its release gates and was published as the
reviewed GitHub Release
[`dsh-ai-asset-hub-v0.1.1`](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-ai-asset-hub-v0.1.1):

- clean public history with GitHub noreply commit identities;
- Node 22.19 and Node 24.19 CI;
- exact five-file package including the MIT license;
- two byte-identical packs with recorded compressed and uncompressed hashes;
- official AI Asset Hub `v0.1.11` provider identity and checksum;
- exact eight-tool read-only contract, real safe calls and seven-tree
  zero-write verification;
- fail-closed activation, duplicate namespace rejection, reconnect and process
  cleanup;
- exact tarball installation, single config entry, removal and rollback SOP;
- unauthenticated public API, clone and source-boundary audit.

The annotated tag resolves to public commit `d51dae1`. Two packs from that
exact commit were byte-identical. The Release contains the reviewed `.tgz` and
`SHA256SUMS`; downloading the uploaded asset reproduced the recorded digest.
The downloaded artifact installed exactly once in a disposable DSH profile,
started the reviewed `aiah mcp` child, passed all eight real read-only calls
and seven-tree zero-write verification, removed cleanly, and left no provider
process behind.

npm publication remains an independent product and account decision. The
marketplace gate is also still pending: the repository must naturally reach
the required age and at least ten meaningful commits. Empty commits must not
be created to satisfy that count. Model-visible L5 selection and any live
profile deployment are separate acceptance gates and are not claimed here.

## AgentMemory

The architecture decision is option A: users supply a reviewed stdio adapter.
This repository does not copy the private adapter and does not publish a
portable one. The decision record is
[agentmemory-adapter-decision.md](agentmemory-adapter-decision.md).

A public configuration-only workspace now exists at
`packages/dsh-agentmemory`. It is rewritten for this repository: exact peer
dependency, package-local MIT `LICENSE`, fail-closed absolute command checks,
and no private Git history, adapter source, host paths, tokens or observation
IDs.

The private `@dff652/dsh-agentmemory@0.1.0` digest is not the public artifact.
A working private deployment is evidence for the provider and adapter
contract, not authorization to ship that private bundle. Automatic prompt,
tool-result or full-session capture remains disabled and is not claimed.

The accepted business surface is recall plus explicit-project save and
cross-session recall. The discovered eight-tool list is frozen as the MCP
contract; the other tools are not all claimed as semantically accepted.

Push, tag, GitHub Release, npm, marketplace listing and live-profile
installation of the public package remain separate owner-authorized
transitions.

## Agent Mail

Agent Mail now has a configuration-only public package workspace at
`packages/dsh-agent-mail`. The public candidate is rewritten for this
repository: exact peer dependency, package-local MIT `LICENSE` and `NOTICE`,
and no private Git history, provider source or host-specific fixture paths.

The private `@dff652/dsh-agent-mail@0.1.0` digest is not the public artifact.
Local Node 22/24 portable checks, dual pack, eleven-tool canary, approval
denial, fail-closed activation, reconnect, cleanup, clean-profile
install/remove and AIAH coexistence passed. The public source is on
`origin/main`. Tag, GitHub Release, npm, marketplace listing and live-profile
installation remain separate owner-authorized transitions.

Native automatic wake and session injection are not part of the
configuration-only candidate. The provider `MIGRATION-REPORT.md` is stale
relative to public `ca6601c` and is not edited from this repository.
