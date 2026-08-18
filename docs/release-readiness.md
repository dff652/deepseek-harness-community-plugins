# Public release readiness

This document defines the gates for the clean-history
`@dff652/dsh-ai-asset-hub@0.1.1` candidate. Passing one gate does not authorize
the next state transition.

## Current state

The repository is a local staging tree with no commits and no remote. It was
created from reviewed source files without copying, cloning, forking or
mirroring an earlier Git database. It is not public and has no tag, GitHub
Release, npm package, marketplace entry or live deployment.

The bundle is a configuration-only bridge to an independently installed AI
Asset Hub executable. It starts `DSH_AIAH_COMMAND mcp` through the exact
`@deepseek-ai/dsh-mcp-client@0.1.0-rc.6` peer and exposes the reviewed eight
read-only tools. Provider code, binaries, credentials, homes and runtime data
remain outside the package.

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

The package allowlist is exactly:

```text
package.json
index.js
cordis.patch.yml
README.md
LICENSE
```

The child package must declare `dsh.bundle.patch`, remain publishable, and keep
official `@deepseek-ai/*` modules as exact peer dependencies. A candidate
tarball is accepted only when two clean packs produce the same SHA-256 and the
unpacked file set matches the allowlist.

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
| Repository | Local clean staging; no commit and no remote |
| Git identity | GitHub noreply configured locally |
| Node / npm | `v24.19.0` / `11.17.0` |
| Portable tests | 12/12 on Node `v24.19.0`; 12/12 on Node `v22.19.0` |
| Repository boundary | PASS, including secret/path/binary negative canaries |
| DSH | `0.1.0-rc.6` |
| MCP client | `@deepseek-ai/dsh-mcp-client@0.1.0-rc.6` |
| AIAH executable | Official `v0.1.11` Linux AMD64 Release asset |
| AIAH self-report | `0.1.11`, commit `54a77e8a344618f7aa7fc69ba55caffaba985371` |
| AIAH SHA-256 | `6836c21f5fe129d2a36ddaa6635b6b9e08bcd442576eabb9de5e93b11ba92ed8` |
| Plugin tarball | `dff652-dsh-ai-asset-hub-0.1.1.tgz` |
| Tarball SHA-256 | `d988b5e07ca63324b2ee9cc205cf8d21f98490a84389f6264adcc0bc59f6ccba` |
| Decompressed tar SHA-256 | `71ecdaab3304807891da3900db28acd3f0af3d622606b7314f136ebf69275d50` |
| Reproducible pack | Two clean packs were byte-identical |
| Packed files | Exact five-file allowlist, including `LICENSE` |
| MCP / zero-write | Exact eight tools; all calls and seven-tree zero-write PASS |
| Activation | Unset, blank and relative command cases PASS |
| Lifecycle | Missing executable, duplicate namespace, reconnect and cleanup PASS |

The lifecycle runner uses a unique per-run copy of the reviewed provider
binary. Reusing one shared executable path across concurrent verifier runs is
not valid process-ownership evidence and is intentionally excluded from the
accepted run.

## Controlled transition sequence

1. Complete local source, package and runtime verification.
2. Obtain separate authorization for the initial local commit.
3. Create a new GitHub repository as Private only after owner approval.
4. Push and require Node 22.19 and Node 24.19 CI to pass.
5. Recheck the complete remote history and candidate tarball.
6. Obtain separate authorization before changing visibility to Public.
7. Add the `dsh-plugin` topic only after public-readiness review.
8. Wait until the repository naturally satisfies the marketplace age and
   meaningful-commit requirements.
9. Obtain separate authorization for tag and GitHub Release creation.
10. Submit the marketplace entry separately.
11. Treat npm publication and live deployment as independent future choices.

## Future Agent Mail scope

Agent Mail is not included as a placeholder. It may enter as an independent
workspace only after its identity, approval, reconnect, cleanup, artifact and
license gates pass. Automatic wake or session injection must not be claimed
without client-visible evidence.
