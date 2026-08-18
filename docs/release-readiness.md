# Public release readiness

This document defines the gates for the independently versioned public bundle
candidates. Passing one gate does not authorize the next state transition.

## Current state

The repository is a clean-history Public GitHub source repository. It was
created from reviewed source files without copying, cloning, forking or
mirroring an earlier Git database. Its root commit uses a GitHub noreply
identity, and Node 22.19/24.19 CI passes. An unauthenticated API and fresh-clone
audit confirms the public boundary. AI Asset Hub `0.1.1` is tagged and has a
reviewed GitHub Release. The local Agent Mail source candidate is not yet on
`origin/main`. No package is published to npm, listed in the marketplace, or
deployed live by this repository.

The first package is a configuration-only bridge to an independently
installed AI Asset Hub executable. It starts `DSH_AIAH_COMMAND mcp` through
the exact `@deepseek-ai/dsh-mcp-client@0.1.0-rc.6` peer and exposes the
reviewed eight read-only tools. The second package is a configuration-only
bridge to an independently installed Agent Mail `agent-mail-mcp` executable
and exposes the reviewed eleven-tool surface with non-human approval denial.
Provider code, binaries, credentials, homes and runtime data remain outside
both packages.

## Required source and history gates

- Every commit must use the configured GitHub noreply identity.
- The new history must contain no prior repository SHA, ref, tag, URL or
  personal email.
- Scan the complete reachable history and packed artifacts for private
  topology, machine paths, credentials, logs, messages and provider data.
- Reject symlinks, binary source artifacts, file URIs, Windows/UNC deployment
  paths and credential-shaped assignments.
- Keep the root and package MIT license texts aligned.
- Pin third-party GitHub Actions to reviewed commit SHAs from the official
  `actions/*` repositories.
- Do not manufacture commits to meet a marketplace count. Each commit must be
  a meaningful reviewed change.

## Package gate

The AIAH package allowlist is exactly:

```text
package.json
index.js
cordis.patch.yml
README.md
LICENSE
```

The Agent Mail package allowlist is exactly:

```text
package.json
index.js
cordis.patch.yml
README.md
LICENSE
NOTICE
```

Each child package must declare `dsh.bundle.patch`, remain publishable, and keep
official `@deepseek-ai/*` modules as exact peer dependencies. A candidate
tarball is accepted only when two clean packs produce the same SHA-256 and the
unpacked file set matches that package's allowlist.

## Runtime gate

Use the official AI Asset Hub `v0.1.11` Linux AMD64 Release asset after
checking it against the publisher's `SHA256SUMS`. Never substitute a source
build or a command found through host `PATH`.

Run all acceptance work in disposable homes and profiles:

1. MCP initialize returns server `aiah` version `0.1.11`.
2. `tools/list` returns exactly the eight reviewed tools.
3. Every tool completes a real safe call and all tracked trees remain
   unchanged.
4. Unset, blank, relative and missing commands fail closed.
5. Duplicate `serverName: aiah` fails closed.
6. Provider crash reconnects without duplicate registration.
7. DSH stop removes the provider child.
8. Exact tarball install appears once in `--dump-config`; removal deletes it.

L5 model-visible tool selection is a separate gate and is not claimed by this
candidate.

## Agent Mail runtime gate

Use the reviewed Agent Mail `1.0.0-alpha.4` TypeScript package after checking
the provider tarball SHA-256. Never substitute a host `PATH` Python
`agent-mail` or an unpinned source tree.

Run all acceptance work in disposable homes and profiles:

1. MCP initialize returns server `agent-mail` version `1.0.0-alpha.4`.
2. `tools/list` returns exactly the eleven reviewed tools.
3. send/inbox/claim/done/ack completes on a disposable store.
4. A non-human identity is denied on `comm_approve` and `comm_reject` with
   exit code 6. The two tools remain advertised.
5. Unset, blank and relative command **and home** fail closed.
6. `human@local` is refused as the Harness identity.
7. Duplicate `serverName: agent-mail` fails closed.
8. Provider crash reconnects without duplicate registration.
9. DSH stop removes the provider child.
10. Exact tarball install appears once in `--dump-config`; removal deletes it.
11. The bundle can share a disposable profile with AIAH; remove AIAH first.

Automatic wake, session injection and live Hub token-file use are not claimed.

## Evidence to record after verification

Before requesting a commit, fill the candidate record with:

| Item | Required value |
|---|---|
| Node / npm | Exact versions used to pack |
| DSH | Exact version and integrity |
| MCP client | Exact version |
| AIAH executable | Release tag, commit and SHA-256 |
| Plugin tarball | Filename and SHA-256 |
| Decompressed tar | SHA-256 |
| Packed files | Exact five-file allowlist |
| Source checks | Test count and boundary scan result |
| Runtime checks | Initialize, tools, calls, zero-write and lifecycle results |

Do not record secrets, internal topology, personal paths or provider output
that may contain user data.

### Local candidate record (2026-08-18)

| Item | Recorded value |
|---|---|
| Repository | Public clean-history source; `main` synchronized with origin |
| Root commit | `7411d8c96cb69e45457ef98fe743389e4511a982` |
| Initial CI | `public-staging-ci` run `32105034328`, Node 22.19/24.19 PASS |
| P0 closeout commit | `5a7c09c147126f6fd04bd70e9a338c418b9a10a1` |
| P0 closeout CI | `public-staging-ci` run `32106962601`, Node 22.19/24.19 PASS |
| Public audit | Unauthenticated API, shallow clone, boundary scan and Node 24 13/13 PASS |
| Public metadata | `dsh-plugin`, `deepseek-harness`, `mcp`, `ai-asset-hub` topics |
| Git identity | GitHub noreply configured locally |
| Node / npm | `v24.19.0` / `11.17.0` |
| Portable tests | 13/13 on Node `v24.19.0`; 13/13 on Node `v22.19.0` |
| Repository boundary | PASS, including secret/path/binary negative canaries |
| DSH | `0.1.0-rc.6` |
| MCP client | `@deepseek-ai/dsh-mcp-client@0.1.0-rc.6` |
| AIAH executable | Official `v0.1.11` Linux AMD64 Release asset |
| AIAH self-report | `0.1.11`, commit `54a77e8a344618f7aa7fc69ba55caffaba985371` |
| AIAH SHA-256 | `6836c21f5fe129d2a36ddaa6635b6b9e08bcd442576eabb9de5e93b11ba92ed8` |
| Plugin tarball | `dff652-dsh-ai-asset-hub-0.1.1.tgz` |
| Tarball SHA-256 | `8a6409cbe69b97269dc7a959e6ddc8ea9814bd86c132939488f9a1b840de7314` |
| Decompressed tar SHA-256 | `15cbdf2b0935973ae305d42f17473ebecd3b2dc0c4676921b54de04b774c90b8` |
| Reproducible pack | Two clean packs were byte-identical |
| Packed files | Exact five-file allowlist, including `LICENSE` |
| Exact tarball profile | Disposable install, one config entry and removal PASS |
| MCP / zero-write | Exact eight tools; all calls and seven-tree zero-write PASS |
| Activation | Unset, blank and relative command cases PASS |
| Lifecycle | Missing executable, duplicate namespace, reconnect and cleanup PASS |
| Release tag | `dsh-ai-asset-hub-v0.1.1`, annotated tag resolving to `d51dae188555ea671464711a80b7ef20a07f769a` |
| GitHub Release | Published 2026-08-18 with `.tgz` and `SHA256SUMS` |
| Downloaded-asset acceptance | Digest check, disposable install/start, eight real calls, seven-tree zero-write, cleanup and removal PASS |

The lifecycle runner uses a unique per-run copy of the reviewed provider
binary. Reusing one shared executable path across concurrent verifier runs is
not valid process-ownership evidence and is intentionally excluded from the
accepted run.

## Controlled transition sequence

1. Complete local source, package and runtime verification. **Complete.**
2. Obtain separate authorization for the initial local commit. **Complete.**
3. Create a new GitHub repository as Private only after owner approval. **Complete.**
4. Push and require Node 22.19 and Node 24.19 CI to pass. **Complete.**
5. Recheck the complete remote history and candidate tarball. **Complete.**
6. Obtain separate authorization before changing visibility to Public. **Complete.**
7. Add the `dsh-plugin` topic only after public-readiness review. **Complete.**
8. Wait until the repository naturally satisfies the marketplace age and
   meaningful-commit requirements.
9. Obtain separate authorization for tag and GitHub Release creation. **Complete for AIAH `0.1.1`.**
10. Submit the marketplace entry separately.
11. Treat npm publication and live deployment as independent future choices.

## Local Agent Mail candidate

`@dff652/dsh-agent-mail@0.1.0` is an independent workspace in this public
monorepo. The private-integration digest is not reused. Dual-pack SHA-256
values below are source-candidate evidence only and are not a publication
authorization.

### Agent Mail source-candidate record (2026-08-18)

| Item | Recorded value |
|---|---|
| Package | `@dff652/dsh-agent-mail@0.1.0` public source candidate |
| Node / npm | `v24.19.0` / `11.17.0` and `v22.19.0` |
| Portable tests | 22/22 on Node `v24.19.0`; 22/22 on Node `v22.19.0` |
| Repository boundary | PASS, including Agent Mail data-path negative canary |
| DSH | `0.1.0-rc.6` |
| MCP client | `@deepseek-ai/dsh-mcp-client@0.1.0-rc.6` peer |
| Provider | `agent-mail@1.0.0-alpha.4` commit `ca6601c95eeda2d5d558cca37179be1412b75a8d` |
| Provider tarball SHA-256 | `925bf5b2371f3a33252af53293a086ce986d1f2558077fb2b6162a726a29d19b` |
| Plugin tarball | `dff652-dsh-agent-mail-0.1.0.tgz` |
| Tarball SHA-256 | `d571c170e1b156407d88ef5f9f0cdb688aaffc522fdf68b11798f4066b71869f` |
| Decompressed tar SHA-256 | `3e4439ae2309979a0ea7fbe5fed298b67cbc0858631c9540d56ab41e36778b3d` |
| Reproducible pack | Two clean packs were byte-identical |
| Packed files | Exact six-file allowlist, including `LICENSE` and `NOTICE` |
| MCP / canary | Exact 11 tools; send/inbox/claim/done/ack PASS |
| Approval denial | Non-human `comm_approve` / `comm_reject` exit code 6 PASS |
| Activation | Unset/blank/relative command and home, plus `human@local`, PASS |
| Lifecycle | Missing executable, duplicate namespace, reconnect, cleanup, install/remove PASS |
| Coexistence | Shared disposable profile with AIAH; remove AIAH then Agent Mail PASS |

This record does not authorize push, tag, GitHub Release, npm publication,
marketplace submission or live-profile installation.

AgentMemory remains excluded from this public candidate. Its private
integration status and public-export blockers are tracked in the
[project status matrix](project-status.md); a working private deployment is
not evidence that a self-contained public package exists.
