# Agent Mail P1.1 backend acceptance

Date: 2026-09-09. Scope: local provider candidate `agent-mail@1.0.0-alpha.5`,
based on public source `ca6601c`. Provider source is committed locally as
`eeb37560fe68a4eb1e2a0ab14f2c34b626339ba6` on `codex/agent-mail-enrollment`.
No push, publication or deployment is implied.
The accepted UI remains 0.1.6 in the isolated preview and 0.1.4 in production.

## Implemented boundary

The provider owns new-identity enrollment over native HTTPS, credential custody,
idempotent recovery, scoped cancellation/expiry, configuration revision checks
and durable commit reconciliation. Existing identities fail closed. Later
independent credential or roster changes survive cleanup; conflicts remain
explicit. The legacy pairing wire behavior is retained for its existing callers.

The joining manager preserves the prior connection while preparing enrollment,
uses a provisional local save before Hub finalization and restores only its
own provisional generation when finalization definitively fails. Unknown
outcomes remain pending reconciliation. An asynchronous file lock serializes
operations from separate management requests and processes. Saved configuration
and running-process activation are separate; absent actual activation evidence,
the result remains `restart_required`.

The mountable management HTTP adapter requires a host-supplied authenticated
principal, request-specific CSRF validation, profile permission and a server-owned
profile/HTTPS target registry. It provides no login service itself. Browser
fields cannot select protected paths, executable commands, credentials or
activation evidence; no management operation is added to mailbox MCP tools.

Concrete POST routes are `/v1/enrollments/{redeem,recover,status,commit,cancel}`
on the protected provider transport, and
`/v1/connection-management/{begin,redeem,status,commit,cancel,activate}` on the
management adapter. The latter's `status.enrollment_handle` also accepts the
original begin context handle after a lost browser redemption response, under
the same owner/profile authorization. Tokens and recovery proofs never appear
in its safe response DTOs. See the provider's `docs/guides/enrollment.md` for
request fields and embedding requirements.

## Exact artifact and gates

| Evidence | Result |
| --- | --- |
| Artifact | `agent-mail-1.0.0-alpha.5.tgz`, 113 packed files |
| SHA-256 | `961bb4e0efc965b11f72a02d30af2211ed350f3f46ea80f4f3bdb7b72f7d78cb` |
| Runtime used for acceptance | Node 20.19.2 |
| Final independent review | Backend, exact artifact and documentation PASS |
| `npm run check` | lint, typecheck, build PASS; 38 test files, 298 tests PASS |
| `npm run contracts:check` | 12 contract artifacts, protocol 0.2 PASS |
| `npm pack --dry-run --ignore-scripts` and actual pack | PASS; required enrollment modules present, no dependencies/test homes embedded |
| Clean temporary-prefix install | Exact tarball installed offline with production dependencies; PASS |
| Installed-artifact execution | Native TLS Hub, guarded new enrollment, safe credential custody, actual MCP remote route and directory PASS |
| Explicit synthetic task | Independent recipient claim, matching terminal result and acknowledgement PASS |
| Restart and restore | Manager/MCP restart, committed-cancel rejection, explicit revision-checked old connection restore and retained old credential PASS |

Real HTTP tests also cover a management host that creates a fresh manager per
request and recovery after the browser loses its redemption response. Crash
tests terminate child processes after selected durable writes and test
simultaneous identity redemption. These are selected crash boundaries, not a
claim of exhaustive power-loss testing.

Independent fault probes reproduced and then passed fixes for repeated definite
commit failures, expired local-custody cleanup, cancellation after `/me`
identity mismatch, manager-instance races and actual cross-process commit/cancel
serialization. The final review also reproduced a Hub/SQLite lock-order conflict between
legacy redemption and guarded commit. Both now acquire the Hub lock before
SQLite; a real legacy API subprocess regression fails on the prior source and
passes on the fix. Full-suite success supplements those targeted assertions.

## Remaining gates and operational limits

- DSH rc.2 has no supplied authenticated management subject, CSRF decision or
  profile ACL at the inspected carrier interface. The
  [host prerequisite](agent-mail-management-host-gap.md) records exact source/API
  evidence and integration choices. The browser wizard is not implemented.
- Actual DSH wizard-to-provider activation, recipient refresh failures and its
  explicit synthetic-task UX still need browser acceptance after host integration.
  The installed-provider MCP proof above does not claim those DSH results.
- The existing shared file-lock implementation uses a five-minute stale lease.
  A hard-crash restart may fail until that lease expires. Crash tests age only
  the terminated child's lock metadata to model that delay; they do not prove
  immediate restart recovery.
- Pending identities and credentials can be usable before local save. Hub
  cleanup runs at startup and periodically, including when a prior journal
  exists but new enrollment is disabled. Keep protected journals and custody
  together in backups; a later independent mutation can require reconciliation.
- Explicit restore is a provider revision-checked operation, not an automatic
  rollback button. Existing identity rotation, federation, presence and automatic
  model wake remain outside this increment.

This record advances the provider portion of the
[P1.1 contract](agent-mail-p11-enrollment-contract.md). A separate authorized
release/deployment decision is required before changing any running provider.
