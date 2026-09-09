# Project status

Status date: 2026-09-09.

The [September 9 delivery and UI review](agent-mail-2026-09-09-review.md)
confirms the live 0.1.4 mailbox and authorized browser-to-recipient-MCP
delivery. It also records client connection and interface limitations, the
merged Agent Mail marketplace PR, and the separate 0.1.5 improvement candidate.
The [0.1.5 candidate record](agent-mail-ui-0.1.5-acceptance.md) keeps its local
archive and checks separate from the released/live 0.1.4 baseline.
The [capability comparison and ordered checklist](agent-mail-capability-roadmap.md)
record full-provider versus bundle responsibilities, real Codex receipt and
isolated model execution, and the remaining sidebar and cross-machine gates.

The September 5 review refreshes Agent Mail UI only. Other package sections
retain their previously recorded evidence and are not a new release audit.

Agent Mail UI 0.1.4 closes the broader review findings and passes the local
acceptance gates. Its source is pushed, CI passed and the reviewed GitHub
Release is published. The approved five-plugin rc.2 live migration is also
complete; see [next steps](agent-mail-ui-release-plan.md) for the observed
state and rollback baseline.

This matrix separates implementation, private deployment, public source,
GitHub Release, npm publication, marketplace listing and live deployment.
Those transitions are not interchangeable and each external publication step
requires owner authorization.

## Summary

| Bundle | Implementation | Public source | GitHub Release | npm | Marketplace | Live use |
|---|---|---|---|---|---|---|
| `@dff652/dsh-ai-asset-hub@0.1.1` | Complete | Complete | Released | Not published | Listed; merged [#2957](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2957), post-merge verifier PASS | Separate decision |
| `@dff652/dsh-agent-mail@0.1.0` | Complete; separate provider required | Complete | Released | Not published | [#2988](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2988) merged; state rechecked September 9 | Public artifact not installed live; private companion 0.1.1 is separate |
| `@dff652/dsh-agent-mail-ui@0.1.4` | Complete; acceptance PASS | `e179d893` on `origin/main` | [Released](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-ui-v0.1.4) | Not published | Not submitted | Live with DSH/MCP rc.2, Agent Mail 0.1.1, private Memory 0.1.1, sidebar 0.12.2 and market 1.41.0; Graph temporarily excluded; browser/API/restart PASS |
| `@dff652/dsh-agent-mail-ui@0.1.5` | Local candidate; source review, 99 tests, real standalone and corrected model flow PASS; full real sidebar gate incomplete | Local candidate; not pushed | Not released | Not published | Not submitted | Separate disposable preview only; live UI remains 0.1.4 |
| `@dff652/dsh-agentmemory@0.1.0` | Public configuration candidate plus separate adapter candidate complete | Bundle source complete; adapter local only | Blocked on public adapter Release | Not published | Not submitted; public adapter bytes and bundle Release pending | Private deployment remains separate; public package not installed live |

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
repository naturally reached the required age and ten meaningful commits, and
the AIAH entry was submitted as
[awesome-dsh-plugin#2957](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2957).
Both automated checks passed, the PR merged as `26f0b940`, and the entry is
visible in the live catalog and detail page. The exact catalog tarball digest
was rechecked, then those same downloaded bytes installed exactly once and
removed cleanly with DSH `0.1.0-rc.6` and pnpm `11.7.0` in an isolated
temporary home and store. This is not evidence of a browser click.
Model-visible L5 selection and any live-profile deployment are separate gates
and are not claimed here.

The reviewed dshmarket `1.10.1` backend route also passed independently in a
disposable profile. The verifier fetched the live registry, submitted the
same-origin install request, tied the response to source commit
`f16f317190b4a98db5177045f0b4755ee93ae2fd` and the installed lockfile,
confirmed restart activation with the exact reviewed AIAH executable, then
uninstalled and proved package, profile and provider-process cleanup. Because
the catalog record has `npm: null`, this route installs the GitHub source
target, not the exact Release tarball; the machine report says
`sourceInstall: true`, `exactReleaseArtifact: false`, `browserDomClick: false`
and `liveProfileChanged: false`. The exact-tarball gate above and this backend
gate are complementary rather than interchangeable.

## AgentMemory

The bundle architecture remains option A: users supply a reviewed stdio
adapter and this repository stays configuration-only. On 2026-08-24 the owner
authorized option B as a separate clean-room product. A local
`@dff652/agentmemory-mcp-adapter@0.1.0` candidate now exists outside this
monorepo at local commit `c0656eb`; it is not yet pushed, public, tagged,
released or published to npm.
The amended decision record is
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
Verifier ranking looks only at `results`; IDs or keywords in sibling decoy
fields are not a PASS. Project-scoped cases fail immediately if the
`memory_recall` schema omits `project`. Keywords are taken from `narrative`,
`facts`, `content`, `text` and `title`, never from `id`, `sessionId` or
`type`. A missing `project` on `memory_save` must leave the store unchanged.

An independent re-review on 2026-08-18 and follow-up hardening on 2026-08-19
closed the verifier blockers. The omit-project-schema, ignored-project,
cross-project observation, forbidden-ID, metadata-stuffing and split-content
negatives now fail as required. Portable tests passed 54/54 on both Node 22.19
and Node 24.19; activation, lifecycle and clean Web/headless profile checks
also passed. A read-only call through the
reviewed AgentMemory 0.9.28 adapter confirmed the exact eight-tool contract,
`diagnosis.fail = 0`, explicit project forwarding, `truncated: false`, existing
canary recall and clean process termination. The public source candidate was
pushed to `origin/main`; remote CI passed at commit `4720f69`. It remains
unreleased.

The full `test:real-mcp:agentmemory` gate is intentionally not read-only: it
writes three expected canaries plus three cross-project decoys (one per marker)
to dedicated test projects, and the accepted provider surface has no delete
tool. It must run only against a disposable AgentMemory store. A routine audit
of an existing store must use the verifier with reviewed existing canaries
instead. Ad-hoc query mode is a single-observation content smoke test, not
project-isolation evidence. Because AgentMemory 0.9.28 observations omit
`project`, every strong
project-scoped benchmark case must name an expected observation ID and a known
cross-project forbidden observation ID.

The new adapter candidate is MIT licensed, dependency-free and fail closed. It
pins AgentMemory `0.9.28` through startup health/tool preflight, requires a
protected secret file and a configured project, and never falls back to local
memory. Node 22.19/24.19 portable checks passed, two packs were byte-identical,
and the final ten-file tarball SHA-256 is
`b38484f70bea9c7a632cabc922d9d7789af80fd5c987afb15146cc65afb49c5a`.
A clean install of those bytes passed real project A/B isolation, restart
persistence, provider-stop failure, DSH 3/3 rank-one recall, activation,
reconnect/cleanup, install/remove and Web/headless clean-profile gates.

The configuration bundle must still not advance to tag, GitHub Release or
marketplace submission until the adapter repository and Release are separately
authorized, public, CI-clean and revalidated from downloaded Release bytes.
npm publication and live-profile installation remain separate decisions.

## Agent Mail

Agent Mail now has a configuration-only public package workspace at
`packages/dsh-agent-mail`. The public candidate is rewritten for this
repository: exact peer dependency, package-local MIT `LICENSE` and `NOTICE`,
and no private Git history, provider source or host-specific fixture paths.

The private `@dff652/dsh-agent-mail@0.1.0` digest is not the public artifact.
The public package was released as
[`dsh-agent-mail-v0.1.0`](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.1.0).
Local Node 22/24 portable checks, dual pack, eleven-tool canary, approval
denial, fail-closed activation, reconnect, cleanup, clean-profile
install/remove and AIAH coexistence passed. The anonymously downloaded Release
tarball matched the recorded SHA-256 and passed the same disposable lifecycle.
Marketplace PR [#2988](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2988)
is merged (2026-08-24), as rechecked on September 9. This corrects the stale
pending status; it is not a new marketplace installation acceptance. npm
publication and live installation of this public artifact were not performed.

Native automatic wake and session injection are not part of the
configuration-only candidate. The provider `MIGRATION-REPORT.md` is stale
relative to public `ca6601c` and is not edited from this repository.

## Agent Mail UI

`@dff652/dsh-agent-mail-ui@0.1.4` is a separate host/client package. It
reuses the tools mounted by `@dff652/dsh-agent-mail`; the two installed
packages are complementary and do not start duplicate MCP children.
Approve/reject are not proxied, and automatic wake, push delivery and polling
remain outside v1.

With `dsh-better-sidebar`, the client registers `dsh-agent-mail:inbox` in the
existing right panel. Without it, the client provides a bottom-right drawer.
The settings section explains those entry points; it is not another mailbox.

The 0.1.4 follow-up fixes selected-session Quote, tool-result lifecycle and
payload handling, and acknowledged-mail unread counts. It includes the
previous Done/Ack fixes. See the [current acceptance record](agent-mail-ui-0.1.4-acceptance.md)
for exact bytes, checks and their scope; [0.1.3 evidence](agent-mail-ui-acceptance.md)
is historical and must not be used to qualify a new archive.

The prior live baseline was DSH/MCP `0.1.0-rc.6`, Agent Mail bundle `0.1.1`,
UI `0.1.2` and better-sidebar `0.12.2`. The selected target followed the
manifest pins: DSH/MCP `0.1.1-rc.2`, Agent Mail `0.1.1`, UI `0.1.4`, private
AgentMemory `0.1.1`, better-sidebar `0.12.2` and dsh-market `1.41.0`, with Git
Graph temporarily excluded. A stop-and-fresh-copy cutover completed; the old
runtime and home remain the rollback baseline.

Commit `8187f7b` introduced the UI, `27a5a2e` fixed host registration and
composer context, and `013ddd1` recorded 0.1.3 fixes and the full-range
review findings. Commit `e179d893a15a71979e8c8a05919a691abe65d5d6` is now on
`origin/main`; CI run `33945657776` passed on Node 22.19 and 24.19. Annotated
tag `dsh-agent-mail-ui-v0.1.4` targets that commit, and its GitHub Release
contains the exact archive and `SHA256SUMS`. Anonymous download verification
reproduced the archive digest and passed disposable Web/headless install once
and remove checks. npm publication and marketplace submission were not
performed. The live profile now runs the selected DSH/MCP `0.1.1-rc.2` target
and the approved five-plugin combination. Authorized HTTPS browser access, the
Mail sidebar, live Mail API/diagnostics and a new blank session after restart
passed. System DNS was not changed; browser access used the existing proxy
mapping over valid TLS. The old rc.6 runtime and home remain available for
rollback.
