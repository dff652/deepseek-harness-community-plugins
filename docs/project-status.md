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
| `@dff652/dsh-agent-mail@0.1.0` | Private candidate validated | Public source candidate; not pushed | None | Not published | Not submitted | Not installed by this project |
| `@dff652/dsh-agentmemory@0.1.0` | Private integration active | Not exported | None | Not published | Not submitted | Active private deployment |

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

AgentMemory currently has a working private integration, not a public package.
The private `@dff652/dsh-agentmemory@0.1.0` bundle is installed in a shared DSH
Web profile and starts a deployment-owned stdio adapter. Current read-only
verification confirms:

- AgentMemory server `0.9.28` initializes successfully;
- the exact eight-tool contract is visible;
- the focused contract/verifier suite passes 11/11;
- the three-case recall benchmark passes 3/3, with every expected observation
  at rank 1 and no truncated result;
- diagnosis reports `fail=0`; three warnings and one fixable data-governance
  finding remain visible instead of being hidden;
- the provider process exits cleanly after the verifier.

The accepted business surface is narrower than the discovered tool list.
Recall and explicit-project save/cross-session recall have real evidence.
Automatic prompt, tool-result or full-session capture remains disabled, and
the other discovered tools are not all claimed as semantically accepted.

AgentMemory is not ready for public export because the current private bundle:

- is explicitly marked `private`;
- carries the official DSH MCP client as a runtime dependency rather than the
  public repository's exact peer-dependency convention;
- does not ship a package-local license file in its current allowlist;
- depends on a deployment-owned adapter whose portable public command contract
  is not yet documented or distributed;
- has not passed clean-history export, public boundary scanning, reproducible
  public packing or exact-tarball clean-profile acceptance in this repository.

Before public export, decide whether users will supply their own reviewed
stdio adapter or whether a separately maintained public adapter is required.
Then create a fresh package workspace without copying private Git history or
deployment evidence, include its license and consumer runbook, use an exact
official peer dependency, and repeat contract, recall/save isolation,
fail-closed, reconnect, cleanup and clean-profile gates.

## Agent Mail

Agent Mail now has a configuration-only public package workspace at
`packages/dsh-agent-mail`. The public candidate is rewritten for this
repository: exact peer dependency, package-local MIT `LICENSE` and `NOTICE`,
and no private Git history, provider source or host-specific fixture paths.

The private `@dff652/dsh-agent-mail@0.1.0` digest is not the public artifact.
Local Node 22/24 portable checks, dual pack, eleven-tool canary, approval
denial, fail-closed activation, reconnect, cleanup, clean-profile
install/remove and AIAH coexistence passed. Push, tag, GitHub Release, npm,
marketplace listing and live-profile installation remain separate
owner-authorized transitions.

Native automatic wake and session injection are not part of the
configuration-only candidate. The provider `MIGRATION-REPORT.md` is stale
relative to public `ca6601c` and is not edited from this repository.
