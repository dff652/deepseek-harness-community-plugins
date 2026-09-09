# Agent Mail management host prerequisite

Date: 2026-09-09. Inspected DSH version: `0.1.1-rc.2`.
This is a source/API assessment, not a change to the accepted UI 0.1.6.

## Finding

The current DSH web carrier does not supply the authenticated management
principal, CSRF validation, per-profile permission or controlled process
activation required by the [enrollment contract](agent-mail-p11-enrollment-contract.md).
Registering a new route or generic RPC channel does not establish those
permissions. The provider's guarded API therefore cannot yet be mounted as a
working enrollment wizard in the current bundle.

The inspected DSH CLI archive has SHA-256
`47ec05f45ada5ab87779ae18a90456b5ebff5421dc0ff5c179677d65e1c16057`.
The relevant installed packages below all declare `0.1.1-rc.2`.

## Inspected interfaces

Paths in this table are relative to the named installed package, not deployment
paths. The findings are grounded in the declared interfaces and implementations.

| Package | Evidence | Consequence |
| --- | --- | --- |
| `@deepseek-ai/dsh-host-webserver` | `README.md:19` explicitly excludes TLS and authentication; `lib/types/index.d.ts:32` defines raw request/response route handlers; `lib/index.js:178` dispatches them directly | Route registration provides no authenticated subject or session/CSRF context |
| `@deepseek-ai/dsh-client-connection` | `lib/types/api-request-trust.d.ts:1` distinguishes the browser trust fence from authentication; `lib/index.js:485` applies reachability and Host/Origin fencing; `lib/types/rpc-host.d.ts:5` exposes generic RPC registration | Loopback trust, a permitted Host and same-origin RPC cannot stand in for management authorization |
| `@deepseek-ai/dsh-host-apiproxy` | `lib/types/index.d.ts:1` defines a transport-independent API surface; `lib/types/fetch/handler.d.ts:1` supplies a request/response carrier | The API proxy does not supply a login identity, CSRF decision or profile ACL |
| `@deepseek-ai/dsh-authorization` | `README.md:5` describes credential acquisition with human interaction; `lib/types/index.d.ts:67` and `:150` define prompt/notify credential flows | Credential consent is a different boundary from an authenticated HTTP management session |
| `@deepseek-ai/dsh-app-boot` | `lib/types/profile.d.ts:26` and `:82` define file-backed profile loading/composition; `lib/types/index.d.ts:220` boots one context | These interfaces do not expose a management registry or a controlled activation/restart operation for a selected running target |
| `@deepseek-ai/dsh` | `lib/profile-boot-DG5t9aNs.js:215` runs one profile and returns its context/shutdown; `lib/bin.js:130` dispatches that invocation | A process-launch profile selection is not a browser-authorized target activation controller |

The bundle itself follows the raw web-carrier interface:
`packages/dsh-agent-mail-ui/index.js` registers a request/response handler and
checks Host, Origin and Fetch Metadata. It does not have an authenticated
management principal. Ordinary mailbox access must not implicitly grant token
issuance, connection replacement or process restart permission.

## Required integration

A management host must provide all of the following before the wizard issues
real mutations:

- A stable authenticated subject, request-specific CSRF validation and
  permission for the selected profile and operation.
- A server-owned registry resolving opaque profile handles to protected homes,
  approved HTTPS targets, CA policy and provider configuration.
- An activation plan for the selected provider process, which can initially
  report `restart_required` and require an explicit operator restart. A saved
  file alone is insufficient; verify effective route and identity through that
  process, and retain the prior configuration for explicit restore. Automated
  restart would require its own controlled lifecycle integration.
- Safe API results without tokens, recovery proofs, command paths or provider
  homes in browser persistence, model tools or ordinary logs.

The provider's `createConnectionManagementListener` accepts the host's
authorization callback and server-owned profile registry, and rejects requests
when those decisions are absent. It is not a login service or restart manager.

## Delivery choices

The provider API and its tests can be delivered independently while the UI
remains at 0.1.6. Continuing the wizard requires either a separately implemented
authenticated management host with explicit activation handling, or reviewed
native DSH interfaces providing equivalent guarantees. A reverse proxy by
itself does not supply the complete CSRF and profile-policy contract. The
missing automatic restart API does not prevent a correctly authorized wizard
from exposing the separate `restart_required` state.

No new management service, production provider upgrade or wizard deployment
is performed by this assessment. Those integration choices remain explicit.
