# Agent Mail P1.2 authenticated host and wizard acceptance

Date: 2026-09-09. Candidate: provider `1.0.0-alpha.6`, UI `0.1.7`,
DSH `0.1.1-rc.2`. This records local candidate work; the accepted UI 0.1.6
preview and 0.1.4 production installation were not upgraded.

## Scope

The provider's optional `agent-mail/dsh-management` module supplies an explicit
management principal, private password file, short-lived HttpOnly session,
SameSite=Strict, CSRF validation and configured profile ACL. It mounts in the
existing DSH process through an operator-owned private patch. The public UI
bundle adds same-origin login and enrollment controls, not provider code or
credentials. DSH's ordinary Host/Origin fence remains separate from login.

The browser follows approved profile and HTTPS Hub selection, new-identity
pairing, identity confirmation, revision-checked save, explicit host restart,
re-login/recovery, actual MCP activation proof and recipient selection. A saved
connection is not shown as active until the mounted MCP child proves its
identity, remote HTTPS route, saved revision and token-file credential source,
with a successful directory read. Other registered profiles cannot claim
activation through the current DSH child.

Password, pairing code and CSRF are never persisted in browser storage. Recovery
retains only opaque context/enrollment handles, profile handle, request ID and
observed revision. Closing the page or clearing recovery does not cancel the
provider enrollment. Cleanup conflicts remain explicit. No restart command or
automatic model wake is introduced.

## Verification

| Gate | Result |
| --- | --- |
| Provider lint, typecheck, build and full tests | PASS: 41 files, 307 tests |
| Provider contract manifest | PASS: 12 artifacts, protocol 0.2 |
| Community portable tests, Node 22.19.0 / 24.19.0 | PASS: 103 tests on each version |
| Public boundary, relative links and generated client freshness | PASS |
| Chrome 152 / Firefox 155 fixture | PASS: 17 scenarios per browser |
| Fixed-height wizard fixture | PASS: real scrolling reaches all enrollment controls in a clipped 70vh host |
| Packed provider offline installation | PASS: fresh production-dependency install; installed files match archive |
| Real DSH host authentication | PASS: login, HttpOnly/Strict cookie, missing-CSRF rejection, denied profile and logout |
| Real DSH browser lifecycle | PASS: login, TLS pairing, identity confirmation, save, restart-required, explicit restart, re-login/recovery and actual MCP activation |
| Real task round trip | PASS: browser explicitly sends read task, independent recipient claims/completes/acks, sender receives matching done |

The final provider archive `agent-mail-1.0.0-alpha.6.tgz` has SHA-256:

```text
2c3fed0a2a9830e3119869dffa89201ed4aa369486503459a1008f69e0a768be
```

The final UI archive `dff652-dsh-agent-mail-ui-0.1.7.tgz` has SHA-256:

```text
e45bdcd2ce9bcdfec0da1de7e5ea2d619ce0b2d6f4d3afa7e2646d7a1e0615c0
```

Both passed `npm pack --dry-run --ignore-scripts` and packed-file inspection.
The UI archive contains eight declared files, with the management controller
embedded in the generated client. Provider implementations, tests, protected
configuration and runtime databases are not copied into the UI archive.

The HTTP/session tests cover expiry, restart-invalidated cookies, Origin/Host
checks, CSRF, explicit profile grants and startup rejection of unsafe endpoint
URLs. Regression tests verify that credential-bearing URLs fail without network
access or credential text in MCP responses/logs. Controller/browser tests cover
lost-response recovery, identity confirmation, duplicate submission guards,
restart-required state, cancellation/cleanup state handling, directory failure
and explicit task submission. Synthetic fixture results are not represented as
real Hub or DSH acceptance.

## Failures resolved during acceptance

- The first real fixed-height DSH drawer clipped the pairing input. The wizard
  now uses a constrained scroll region while open; a browser regression checks
  actual control visibility after scrolling in Chrome and Firefox.
- Activation initially interpreted the enrollment token path relative to the
  host working directory. The journal supplies a provider-home-relative path;
  both paths now resolve under that home. A regression failed before the fix
  and verifies relative paths, absolute paths and mismatch rejection.
- The previous UI diagnostic adapter read only local `agent_id_env`, leaving
  the remote Hub identity unknown. Remote mode now reads authenticated
  `agent_id` and never falls back to a stale local environment identity. The
  regression failed before the fix, and the browser fixture now uses the real
  remote diagnostic response shape.

An independent reviewer inspected the combined host/auth/wizard diff and each
of these corrections without editing source; all reviews passed. The real DSH
run used only disposable TLS Hub/client homes and the exact archives above.
Installed provider and UI files matched every archived file. Screenshots were
inspected locally; only synthetic messages and identities were used.

The acceptance driver also required two corrections: waiting for enabled form
controls and scoping its task textarea to the Agent Mail panel rather than the
DSH conversation composer. The final full run passed after those corrections;
no model invocation was needed. The temporary host was stopped after review.

## Boundaries

This is an opt-in single-operator management adapter, not native DSH account
management or a general profile launcher. The operator must mount the private
configuration and explicitly update/restart any older Hub environment. The
browser-visible origin must match the configured origin exactly, including
port; forwarding headers are not authorization.

Existing Hub URLs containing userinfo, query, fragment or a path prefix are
rejected before network access. Credentials belong in the protected token file;
accepted Hub endpoints are root origins. This also prevents diagnostic error
paths from exposing credential-bearing URLs.

The [P1.1 backend acceptance](agent-mail-p11-backend-acceptance.md) remains the
record for enrollment expiry, cancellation, idempotent recovery, rollback and
shared locking. Its five-minute stale-lock limitation still applies. Successful
directory reads prove directory access, not recipient presence. The synthetic
recipient in acceptance is explicitly driven; no automatic model handling is
claimed. Push, publication and live upgrade remain separate owner decisions.
