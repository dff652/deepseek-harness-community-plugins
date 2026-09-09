# Agent Mail P1.1 enrollment contract and gap assessment

Date: 2026-09-09. Status: the assessment below is retained as the design baseline.
The provider increment is now implemented and locally validated as
`agent-mail@1.0.0-alpha.5`; see the [backend acceptance record](agent-mail-p11-backend-acceptance.md)
for concrete routes and completed gates. The DSH wizard still requires the
[management host prerequisite](agent-mail-management-host-gap.md).
UI 0.1.6 remains the accepted P0 artifact.

## Decision

The first enrollment increment joins one existing HTTPS Hub using a **new
identity** from one explicitly selected DSH/provider profile. Preserve the
previous active connection throughout preparation. Existing identity adoption,
credential rotation, federation, automatic wake and presence are separate work.

Do not connect the existing public redemption endpoint directly to the browser
wizard. It commits roster/token changes immediately and can invalidate an
existing identity's credentials. A provider-owned guarded enrollment protocol
is required before real UI integration.

## Inspected baseline and evidence

The maintained public source was clean at commit
`ca6601c95eeda2d5d558cca37179be1412b75a8d`, package `1.0.0-alpha.4`.
A tracked-source snapshot was built in an isolated directory. Nine relevant
runtime modules matched the fresh build after TypeScript emission with comments
removed: pairing, connection, connection policy, Hub server/auth/mail API,
remote client and MCP server/stdio. This is a limited code comparison, not
whole-package reproducibility or a provider security audit.

The complete runtime CLI differs from the fresh build, including the source's
additional quickstart command. Its `pair` and `connect` branches match when
printed without comments. Version equality alone is insufficient to choose an
upgrade artifact. Selected runtime SHA-256 values:

| Runtime module | SHA-256 |
|---|---|
| `pairing.js` | `b526dab3429fdafc7aaa7c782198619e955d7aa2e84af9bd7b6f1155072c5a54` |
| `connection.js` | `a4d2ae999643c5ebd984d92d330d6d7bcd5da61028f0a37464c36d6157495168` |
| `hub/auth.js` | `3059c86cf7ad9de27d2abadd766b778be81469649b57a3fb490bdc3056062314` |
| `mcp/server.js` | `e89a9221e42a929fe392a83bdb4b96d4dbe18d5a43858926631e7a386a10972d` |
| `cli.js` | `f729b6c7c6b31329d85c0305a1dcd6a61617707ccfdb7108a1bad2ec0b0a8975` |

Existing provider tests passed in that isolated source snapshot: four files,
28 tests, Node 20.19.2. The command, from the provider package directory, was:

```bash
npm run build
node node_modules/vitest/vitest.mjs run test/pairing.test.ts test/remote-client.test.ts test/hub-tls.test.ts test/security-contracts.test.ts
```

Additional probes imported the deployed runtime modules against a disposable
mail home. They confirmed existing-identity token replacement, rejection of
repeat redemption, inability to revoke a redeemed code, acceptance of a saved
missing token-file reference, failure when resolving that missing file,
`remoteModeEnabled() === false` after saving without the environment switch,
and the identity-only `/me` result. No deployed mailbox or connection was
changed. These checks establish current behavior, not the proposed P1 contract.

## Existing operations and gaps

Source links below are pinned to the inspected commit.

| Existing operation | Authorization and result | Side effects / gap for the wizard |
|---|---|---|
| [CLI `pair create/list/revoke`](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/cli.ts#L505) | Local operator access to provider home; create yields pair ID, one-time code and expiry | Management operation; not an ordinary MCP tool. Revocation only accepts a pending code |
| [HTTP `POST /v1/pair/redeem`](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/hub/server.ts#L420) | No bearer; possession of code, IP/global rate limits; `{agent_id, token, pair_id}` | Immediately ensures roster entry and mints a bearer. Repeat/lost-response retry is not idempotent; bearer must never reach the UI |
| [Mint and compensation](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/pairing.ts#L284) | Internal provider functions | Mint replaces all tokens for that identity. Conditional compensation protects later token operations during redemption failure, but is not a durable post-success cancel/expiry API |
| [Token mint/rotate/revoke](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/hub/auth.ts#L260) | Local operator access | Broad identity-level operations cannot substitute for cancellation scoped to one new enrollment |
| [CLI `connect set/show/test`](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/cli.ts#L733) | Local operator; config references token/CA files; test performs authenticated `/me` | Atomic config write, not transactional Hub enrollment or running-MCP activation; accepts references before credential resolution |
| [`GET /v1/mail/me`, `/agents`](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/hub/mail-api.ts#L265) | Authenticated identity; `{agent_id}` / `{agents,count}` | No stable Hub instance ID, heartbeat presence or delivery receipt. `/me` cannot alone prove which logical Hub was intended |
| [MCP remote selection](https://github.com/dff652/agent-mail/blob/ca6601c95eeda2d5d558cca37179be1412b75a8d/packages/agent-mail/src/mcp/server.ts#L54) | `AGENT_MAIL_HUB_URL` selects remote mode; connection resolver supplies credential/trust | Saving `connection.json` alone does not change the process environment; route/identity must be rechecked after activation |
| Current UI host API | Mailbox dispatcher with Host/Origin checks and bounded POST bodies | Not a management authorization boundary. Do not add enrollment to its generic MCP proxy or infer administrator permission from same-origin access |

## Proposed v1 boundary

The following are logical contract names, not existing HTTP routes or promised
CLI commands. Provider implementation owns enrollment, credentials and cleanup;
the DSH host owns authenticated management access and target-profile activation.
The bundle consumes reviewed operations rather than copying provider logic.

Every operation is bound to an authenticated management principal and a
server-resolved target profile. The browser must not supply executable paths,
provider-home paths, token-file paths or environment maps. Host/Origin checks
remain necessary but do not establish management permission. Unconfigured
management authorization fails closed; ordinary model/mail tools cannot call
these operations. State-changing browser calls require CSRF protection.

The host validates an explicit HTTPS endpoint and approved CA/trust policy;
reject URL credentials, fragments, query strings and unsupported path prefixes.
Do not silently follow redirects or downgrade TLS. LAN Hubs are allowed only
through the deployment's explicit target policy, not arbitrary browser-directed
server-side requests. The initial Hub context is endpoint plus verified TLS
trust, not an invented stable Hub UUID. A configured identity pin must match
before any credential is sent to a changed target.

### Operation matrix

| Proposed operation | Input visible to UI | Safe result | Required behavior |
|---|---|---|---|
| `connection.begin` | Target-profile handle, HTTPS endpoint, approved trust-profile handle | Context handle, target label, verified endpoint/trust summary, expiry, observed config revision | No pairing or active-config mutation; verify TLS without treating an unauthenticated health 401 as certificate failure |
| `enrollment.redeem` | Context handle, one-time code, request ID | Enrollment handle, new agent ID, expiry, verification timestamp, `pending_save` | Provider-to-Hub protocol atomically rejects an existing identity before mint; stores new credential under protected custody; verifies `/me` identity; clears code from UI |
| `enrollment.status` | Enrollment handle | State, save/activation/cleanup status and retryable error | Authenticated, owner-scoped read; never returns bearer, code, token hash or recovery secret |
| `enrollment.commit` | Enrollment handle, expected config revision, explicit identity confirmation | Durable commit ID, `saved` and separate activation state | Retry resolves the same commit. CAS prevents overwriting concurrent profile changes. Preserves previous credential/config generation until accepted activation |
| `connection.activate` | Commit ID | `active`, `restart_required` or `activation_failed`, dated effective identity/route evidence | Host activates the intended provider process only; never claim active from config existence. Explicit restart may be necessary; ordinary mailbox operation must prove the intended route |
| `enrollment.cancel` | Enrollment handle | `cancelled`, `cleanup_pending` or `cleanup_conflict` | Only before durable commit; revoke/remove only newly owned token/roster generation. Preserve later independent changes. Repeating cancel is safe |
| Directory refresh | Current active profile | Actual identity IDs and read outcome | Independent of save; failure does not roll back a committed connection or trigger pairing again |
| Explicit test message | Selected real recipient, new test operation ID | Message/thread/task identifiers and `awaiting_handling` | One synthetic read task; correlated recipient handling determines completion. Never automatically starts a model or implies presence |

### Common wire requirements

The implementation must freeze concrete route/schema names before UI work.
Use an envelope such as `{ok: true, operation_id, value}` or
`{ok: false, error: {code, stage, retryable, operation_id, state}}`.
Handles are opaque, unpredictable identifiers bound to the management owner;
request IDs identify retries and are not authorization credentials. Expiry and
verification times are explicit UTC timestamps. Config revisions are opaque
server-generated compare-and-swap values, not browser-supplied filesystem data.

A commit request must include `enrollment_handle`, `expected_config_revision`
and the confirmed `agent_id`; reject a mismatch with the stored enrollment.
A result reports `save_state`, `activation_state` and `cleanup_state`
independently. The provider must define bounded context/enrollment lifetimes,
request timeouts and idempotency retention that covers the documented retry
window. Expiry must not turn a previously committed enrollment into pending
cleanup. Error messages must not contain credentials or raw protected paths.

### Durable state and retries

`context_ready → pending_save → commit_in_progress → saved → active` is the
successful path. Before commit, expiry/cancel transitions through
`cleanup_pending` to `cancelled` or `expired`. `cleanup_conflict` is explicit
when a later owner changed the token/roster generation. Saved-but-not-active
is a stable, visible state with activation retry or an explicit restore action.

The provider/Hub must persist enrollment ownership, expiry, token/roster
mutation generation and commit intent across crashes. The existing pairing
SQLite status alone does not provide this journal. A pending new identity may
already exist at the Hub and its token may already be usable; disclose this
until save/cancel completes. Expiry cleanup must run on the provider/Hub even
if the browser or joining host disappears, and resume after restart.

Persist the host's request ID and recovery proof before sending redemption.
The Hub binds a retry to that proof, principal context, target and request
fingerprint. An idempotency key alone must not allow credential recovery.
The same request returns the same enrollment; changed payload returns
`idempotency_conflict`. Lost responses are reconciled by the protected protocol,
not by blindly consuming the code again. Recovery proof and any recoverable
credential material remain encrypted/protected on their owning hosts; never
place them in browser storage, model context, public configs or ordinary logs.

Commit is not one transaction across two machines. Require durable intent and
reconciliation: retain pending cleanup ownership until the host's generation
is saved and the Hub records the enrollment committed. If either response is
lost, status/retry resumes that commit. Cancellation must not race a committed
configuration into deleting its credential. When final outcome is unknown,
return `commit_in_progress` and reconcile; never report successful cancellation.
A pending expiry racing commit must be serialized at the Hub: a commit that
lost to expiry must not activate the expired credential and must restore any
provisional local generation. Do not silently discard the previous connection.

The first version rejects existing roster/token identity conflicts atomically,
including concurrent redemptions for the same new identity. Supporting rotation
later requires a separate explicit contract; it is not an enrollment fallback.

### Errors and UI semantics

Use `{code, stage, retryable, operation_id, state}` plus a safe user message.
Required categories: `management_denied`, `target_not_allowed`,
`tls_untrusted`, `hub_unreachable`, `code_invalid_or_expired`, `rate_limited`,
`identity_conflict`, `identity_mismatch`, `context_expired`,
`idempotency_conflict`, `config_conflict`, `save_failed`, `activation_failed`,
`cleanup_pending`, `cleanup_conflict`, `directory_failed` and `test_timeout`.
Do not leak whether an invalid code belongs to a particular identity.

A retryable error authorizes retry of that operation only. `saved` with
`directory_failed` keeps the saved connection and offers directory retry;
`awaiting_handling` or `test_timeout` does not mean the recipient is offline.
Connection evidence must show its timestamp and remain separate from presence.

## Implementation acceptance gate

These are the design acceptance requirements, distinct from the 28 baseline
tests above. The linked backend acceptance record identifies the implemented
provider checks and the remaining DSH/browser gates:

| Case | Required assertion |
|---|---|
| Existing identity / simultaneous enrollment | Original token and roster remain unchanged; at most one new enrollment owns the identity |
| Duplicate request / lost redeem response | Same owner recovers one enrollment, no second mint; another caller cannot recover it by request ID |
| Invalid/expired code, wrong Hub identity or TLS | No active-profile change; safe error; any new provisional state is explicitly reconciled |
| Save failure / concurrent profile edit | Previous connection preserved; retry same enrollment; config CAS conflict cannot overwrite another save |
| Crash before/after each commit boundary | Journal reconciliation yields one durable commit or scoped cleanup; never both successful commit and credential cancellation |
| Cancel, browser exit, expiry, Hub/host restart | Pending credential/roster cleanup completes or reports conflict; later credentials remain valid |
| Saved but remote environment not activated | UI remains saved/restart-required; no claim of remote routing from `connect set` alone |
| Unauthorized management / unsafe target | Ordinary mailbox users and model tools cannot redeem, commit, activate or cancel; redirects/trust changes do not leak credentials |
| Save succeeds, directory fails / empty directory | Read-only retry, no extra redemption; empty directory remains a successful empty result |
| Test send timeout or transport retry | One correlated synthetic task; lost response is reconciled before another mutation; no automatic model wake |
| End-to-end activation | Actual DSH/provider route and identity, directory, independent recipient claim/terminal/ack, restart persistence and restore evidence |

Start provider/host implementation with identity conflict, idempotent recovery,
scoped cleanup and durable commit tests. Only after these pass should a UI
worker wire the accepted wizard. Primary review owns combined acceptance.
The reviewed 0.1.6 tarball and existing preview remain unchanged during P1.1.
