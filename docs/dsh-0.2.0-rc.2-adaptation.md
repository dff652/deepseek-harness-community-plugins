# DSH 0.2.0-rc.2 adaptation

Status date: 2026-10-04. Candidate source is pushed; packages remain unreleased.

The target is the official DSH `0.2.0-rc.2` release, upstream commit
`639ed015397290b3745d163aafe02ffee4aa3f84`. The base runtime's 278 official
DSH packages share that version and were verified against registry and
lockfile integrities. Deployment additionally applies the reviewed local
frontend HTML override described below. Native PTY and Node SQLite checks pass.

## Candidates and packed artifacts

| Public bundle | Version | SHA-256 of reviewed tarball |
|---|---|---|
| Agent Mail | `0.2.2` | `5f719a75220d5f192f24a74939d54d0e791ad8b4722fa3c124f807770b824e09` |
| Compatibility Agent Mail UI | `0.2.0` | `b44e270f5b0fa6b525bc5da7f958d15d42c46458b5e172011e9786e91965c6a7` |
| AI Asset Hub | `0.1.3` | `6c72c5f6de9e857c3b6c0f3d5639650f6e5fefd7dd8f125f41c5b32302332b61` |
| AgentMemory | `0.1.2` | `d54cc306855466f679374a343045b0c567bd9924c0a0dd42e39b03eb7b3c15f3` |

Official peers are exact `0.2.0-rc.2` pins. Provider executables, homes,
identities and credentials remain external. The private AgentMemory bundle
has independent bytes and acceptance; its deployment is not a public bundle
release.

## Adaptation and acceptance

Agent Mail uses the current client-module and right-sidebar services. Tool
dispatch supplies a call UUID, arguments and cancellation signal to the
current ToolRuntime. Tool cards consume the current owner phase and block
shape. Generated unified and compatibility clients match their sources.
A short right sidebar previously displayed the sent count while clipping its
rows to zero height. The mailbox now provides a scroll path and preserves
minimum list/detail viewports, including keyboard resize and reset.

DSH now keeps the Web host running when an optional bundle fails activation.
Negative acceptance inspects loader state, absent tool registration and the
original diagnostic, then verifies process cleanup. Missing commands and
duplicate namespaces still fail closed for the affected bundle.

Completed checks include:

- 118 portable contract tests on Node 22.19.0 and 24.19.0;
- public boundary, relative links, generated clients and dry-pack allowlists;
- isolated activation, reconnect, duplicate rejection and removal;
- packed AgentMemory execution with synthetic project isolation and rejected
  implicit-project writes;
- exact installed-file comparison for the combined candidate profile;
- real isolated Agent Mail alpha.7 send, claim, completion and acknowledgement;
- conversion and reopen of all 20 historical sessions, plus browser history
  rendering and blank-session persistence through restart;
- author catalog lookup and exact sidebar source restore in a disposable
  profile, with sidebar `0.24.1` and dshmarket `1.66.8`;
- reviewed AgentMemory `0.9.28` tool discovery, diagnosis and explicitly scoped
  read-only recall through the new host.

The final Mail tarball passed real Chrome and Firefox acceptance, including
visible completed sender rows and acknowledged delivery details. The detail
processing result retains `unknown` when a provider tail lacks the task ID
needed to associate terminal evidence; it does not infer completion from an
unidentified event. This is separate from the canonical task state and the
delivery receipt.

The authorized deployment cutover and controlled restart passed. A fresh
stopped-home copy used the exact accepted archives. All 20 historical session
IDs, settings and attachments were retained; the original compressed session
files remained unchanged. An old session rendered in the production browser,
with 754 persisted records and 66 matching text fragments. The production
Mail identity, durable sent UI, database integrity and all original record
keys passed read-only checks. The deployment uses the independent private
AgentMemory package, Mail `0.2.2`, sidebar `0.24.1` and dshmarket `1.66.8`.

TLS, unauthenticated access control, listeners and the gateway source rule
passed. Protected local login input completed the authorized public HTTPS
core checks: login and both APIs returned HTTP 200, all 20 original sessions
were retained, and Chrome loaded the main UI and Mail identity with rendered
sent rows. No JavaScript runtime exception or unexplained browser error was
observed. The host's DNS did not resolve the public name during this check;
process-local gateway mapping retained certificate verification. No system
DNS setting changed. An optional, unconfigured management endpoint returned
HTTP 405 in browser checks. Optional management enrollment is outside this
acceptance.

Before the local frontend override, the strict check requiring zero severe
console entries failed for a known upstream PWA issue. Official frontend HTML links to
`/manifest.webmanifest` without `crossorigin="use-credentials"`. The browser
requests that manifest without authentication, receives HTTP 401, and logs
both the resource and manifest-fetch errors. An independently attached test
browser reproduced HTTP 200 after adding the attribute only to its DOM.
The original DOM was restored before those core UI checks. Credential inclusion is required even for
an authenticated manifest on the same origin; see the
[MDN manifest credential guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin#web_manifest_with_credentials).

A guarded local deployment override now adds that one attribute to the HTML.
Its original SHA-256 is
`2146ac6dd90f5b6f3896d79e6b9a933eaecb6d90525a18f8fabfc364016a5da5`;
the patched SHA-256 is
`f9129245563f493073b16b233aee882716e356e63090ab3aa4b9a9168d9c10e9`.
Atomic replacement preserves the shared package-store bytes and a verified
original supports rollback. Isolated Chrome reproduced the original four
console errors and returned HTTP 200 with zero errors for the patched page.
The live HTML response contains the attribute; service PID, session IDs and
unauthenticated access controls remained unchanged. Authenticated public
post-patch Chrome verification passed: manifest HTTP 200, credential inclusion,
manifest data present, zero severe console entries, zero runtime exceptions,
all 20 historical session IDs retained, and live Mail API availability. The
test browser and verification terminal were closed after a successful exit.
This deployment override does not alter the reviewed public bundle tarballs
or gateway authentication, and does not claim full PWA installation acceptance.

No paid model turn or message to an unrelated recipient is part of this
adaptation gate. The complete business-write fixture uses isolated stores.

## Publication boundary

The published Agent Mail `0.2.1` Release and merged catalog entry retain the
old exact MCP peer. They are not evidence of DSH 0.2 compatibility. This
adaptation source was pushed to public `main` as
[`0e1f29e`](https://github.com/dff652/deepseek-harness-community-plugins/commit/0e1f29e8b1a93ef82bff53b2314f9d64439a825d).
Its [source CI](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/37206627888)
passed on Node 22.19.0 and 24.19.0, including contracts, repository boundary
checks and dry-run packing of all four public packages. Source synchronization
does not publish an installable Release/npm artifact or change the catalog.
Tags, npm publication, Release artifacts and catalog changes remain separate
owner-authorized transitions and have not been performed for these candidates.
