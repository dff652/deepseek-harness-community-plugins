# Agent Mail recipients and connection design

Date: 2026-09-09. Status: design and local implementation tracking. The
linked P0 and P1.2 records define the accepted scope; presence remains planned.
The accepted visual direction is neutral surfaces, a restrained blue accent,
balanced spacing and collapsible diagnostic details.

The first delivery step is implemented in the
[0.1.6 P0 candidate](agent-mail-ui-0.1.6-acceptance.md): mailbox/recipient views,
a separate composer, unknown-presence wording and failure/retry feedback.
The enrollment and connection-management design below is implemented by the
[P1.2 candidate](agent-mail-p12-management-acceptance.md); presence remains later scope.

## Current capability

The UI obtains recipient IDs through `comm_list_agents`, excludes its own
identity and the human approval identity, and displays connection state as
unknown. In local mode the provider reads the roster in `agents.json`; the
default roster includes named client identities even before those clients
have connected. A roster entry establishes neither a running client nor
permission for every message or effect. Provider validation remains authoritative.

The public provider has pairing-code creation/redemption, identity tokens,
remote connection configuration and `connect test`. Successful pairing
redemption enrolls the identity in the Hub roster and mints its credential.
The current CLI connection test calls the authenticated identity endpoint;
it verifies this client's Hub access, not another client's presence. These
capabilities are not currently exposed as management actions by the DSH UI.

## Proposed surfaces

- **Recipient picker:** show identities from the current mailbox/Hub, with
  search when the list warrants it. Keep the destination mailbox context
  visible. Show a friendly name alongside the stable ID only when supplied
  by the provider; do not infer device location or software from the ID.
- **Recipients:** a secondary view for registered identities, available
  metadata and verification evidence. Label entries as registered, not online.
  An empty roster should explain enrollment rather than leave an unexplained
  empty select. The picker may include unavailable identities with a reason;
  policy checks still happen at submission.
- **Connection:** a separate management surface for the current client's
  local mailbox or remote Hub. Keep endpoints and credentials out of the
  normal message form. The UI must not expose arbitrary file editing or
  shell execution to implement setup.

Friendly names, device labels, structured per-recipient verification and
enrollment controls require provider contracts beyond the current ID list.
Do not ship inert buttons or populated example identities as real features.

## Local and remote enrollment

| Topology | Enrollment and routing | Verification |
|---|---|---|
| Two trusted clients sharing one local mailbox | Configure the same provider home, assign distinct identities and maintain the roster at that home | Diagnose the selected home and identity, then perform an explicit synthetic round trip |
| Multiple devices using one Hub | Enroll an identity at the Hub; provision its own credential through pairing or managed credentials; configure HTTPS Hub access and trust on the joining client; refresh the Hub roster | Authenticate the joining client and compare its returned identity; separately verify recipient handling with a test message |
| Devices each maintaining an independent Hub | Use an explicitly configured federation relationship and routing policy | Verify federation delivery and recovery separately; listing a contact is insufficient |

The recommended initial cross-device topology is one Hub with multiple
clients, matching the accepted transport tests. A local pathname is resolved
on the machine executing the provider, which may differ from the browser's
machine. Likewise, an `@local` identity suffix does not prove physical locality.

For a future enrollment wizard, prefer: select or enter a known Hub, establish
TLS trust, redeem a short-lived pairing code, verify the returned identity,
save the protected connection and refresh recipients. Pairing authorization
belongs to the provider/Hub management boundary, not ordinary mail tools.
Remote credential provisioning must not put tokens into chat, message bodies,
browser persistence or public configuration bundles.

## Enrollment wizard interaction specification

The entry point is **Connection → Join a Hub**. A recipient picker may link
to it, but should not imply that editing a contact connects another device.
The wizard configures the current DSH/provider profile; it must identify that
target explicitly rather than assume the browser's machine is the client.

| Screen | Input and primary action | Successful transition |
|---|---|---|
| 1. Connect Hub | Enter/select the administrator-provided HTTPS endpoint; verify endpoint and certificate trust | Advance to pairing with the verified Hub context visible; this is not yet authenticated client identity |
| 2. Pair | Enter a short-lived code; explicitly redeem it | Clear the code from the view and show the returned identity; redemption consumes the code and may enroll/mint credentials |
| 3. Confirm identity | Show Hub, returned client identity, verification result and destination profile; require explicit identity confirmation | Save the verified connection, then load the directory |
| 4. Recipients | Show saved identity and directory entries; select a recipient for an explicit test | Submit one synthetic test and show awaiting handling; do not start a model or claim presence |

Keep one primary action per screen. Disable duplicate requests while pending,
allow exit, and ignore stale responses after cancellation or navigation.
Allow returning from pairing to endpoint selection. After redemption, do not
offer a misleading back action that silently consumes the code again.

Errors stay beside the relevant input or action: unreachable endpoint,
untrusted certificate, expired/invalid code, unexpected identity, failed
credential verification, failed save and failed directory refresh. Retain
non-sensitive input for correction. Do not expose tokens, retain a redeemed
code, or use a single success badge for every stage.

Save and directory refresh are separate results. A failed refresh after a
successful save should leave the connection marked saved and offer directory
retry. An empty directory is a successful empty result with enrollment
guidance; it must not enable a test with an invented recipient.

### Pairing and cancellation boundary

Pairing is not a read-only connection probe. Redemption can register an
identity and mint a token before the user saves the local connection. Exiting
after redemption must not claim that nothing changed at the Hub. Display the
cleanup result, preserve the prior active connection, and explain when an
administrator must revoke an unused credential. A code revocation is not
automatically equivalent to revoking the credential issued by that code.

Before implementation, define a provider-owned pending-enrollment contract:
short lifetime, credential custody outside browser persistence, idempotent
commit, retry after local-save failure, and scoped cleanup of only the new
enrollment. Existing identity credentials must not be overwritten or revoked
as incidental cleanup. This contract is a requirement, not an assertion that
the current pairing implementation already provides a complete wizard API.

The interaction prototype uses only example data and simulated outcomes.
It covers successful enrollment, untrusted certificates, expired codes,
unexpected identity, save failure and an empty directory. Its controls do
not make network requests, enroll identities or change the running profile.

## State model

| State | What it establishes | Where to show it |
|---|---|---|
| Registered | Identity appears in the current directory | Recipient picker and recipients view |
| Connection verified at a time | This client authenticated to its configured Hub successfully | Connection view, including timestamp and failure reason |
| Recipient response verified at a time | The named recipient handled a unique test message and returned the matching response | Recipients view, explicitly historical |
| Client presence unknown | No fresh heartbeat/presence evidence exists | Recipient details; do not substitute a green online dot |
| Pending / claimed / acknowledged | Provider-reported delivery processing for a specific message | Message row and detail |
| Completed / failed / cancelled | Provider-reported terminal task outcome | Task detail, distinct from delivery acknowledgement |

Offline or unverified clients can still receive queued mail. Do not disable
sending solely because current presence is unknown. Show errors separately
for an unreachable Hub, failed authentication, invalid identity and rejected
message policy when the provider supplies those distinctions. Last successful
verification must remain dated; it must not become a persistent online claim.

## Discovery and diagnostics

Use **Refresh recipients** for directory refresh, **Verify connection** for
the configured client's transport/authentication/identity check, and **Send
test message** for an explicit bounded recipient round trip. The last action
writes synthetic mail and must not run as a side effect of opening a picker.
Without a receiving process or manual check, report that the test is awaiting
handling rather than that the recipient is offline.

Subnet scanning cannot reliably discover stdio MCP clients, and an open port
does not establish identity or permission. Do not make network scanning the
default enrollment mechanism. Optional future service discovery may suggest
Hub endpoints, but must not enroll identities, trust certificates or import
credentials automatically.

## Delivery order and acceptance

1. Apply the accepted visual direction to the current mail actions, recipient
   IDs and honest state wording. Preserve existing Quote, task terminal guards,
   human approval boundaries and panel-local sent-history semantics.
2. Define and test provider-owned directory metadata, enrollment and connection
   verification contracts before exposing corresponding management controls.
3. Add a connection/enrollment wizard and explicit test-message workflow.
4. Add fresh presence only with a real heartbeat contract, expiration rules
   and reconnect acceptance. Federated directories remain a later scope.

Acceptance must include an empty directory, duplicate identity, unknown
presence with queued delivery, expired pairing code, incorrect Hub identity,
TLS/authentication failure and explicit test timeout. Public UI work must not
bundle provider code, endpoints, homes or credentials. The earlier candidate archives and acceptance evidence retain their recorded
scope; the linked 0.1.6 record covers the subsequent P0 implementation.


## Next delivery: P1 Hub enrollment

The 0.1.6 P0 implementation and isolated preview upgrade are recorded at
`054b795`. The next proposed increment is joining one existing HTTPS Hub from
one DSH/provider profile. Use the existing ID directory and ordinary mailbox
operations; federation, heartbeat presence, persistent sent history and
automatic model wake remain separate work.

The [P1.1 operation matrix and proposed contract](agent-mail-p11-enrollment-contract.md)
now record source/runtime checks, 28 existing tests and isolated behavior
probes. The first implementation is new-identity enrollment only: the existing
redemption path can replace old credentials and must not be wired directly
into the wizard. The provider increment and contract tests are now implemented
and locally validated; see [backend acceptance](agent-mail-p11-backend-acceptance.md).
The [optional management host](agent-mail-management-host-gap.md) now supplies
the authenticated boundary. The alpha.6 / UI 0.1.7 candidate connects the wizard;
see [P1.2 acceptance](agent-mail-p12-management-acceptance.md) for its exact gates.

### P1.1: establish the provider contract

Start by rechecking the current provider source, version and runtime artifact.
The older provider commit recorded in the roadmap is a baseline to verify,
not permission to overwrite a newer checkout. Produce an operation matrix
with existing entry points, missing behavior, authorization, request/result
shapes, side effects and error semantics. Proposed operation names are not
claims that the provider already implements them.

The contract must cover:

- Hub endpoint and certificate verification, followed by authenticated client
  identity verification; return dated evidence without asserting presence.
- Explicit pairing-code redemption under management authorization. Keep issued
  credentials in protected provider/host custody and expose only an opaque,
  expiring enrollment handle to the UI.
- Idempotent commit to an explicitly identified profile, with retry after a
  failed save. Define how the running MCP client activates or reloads the new
  connection; a saved setting alone does not prove that remote routing changed.
- Cancellation and expiry that affect only the newly pending enrollment.
  Preserve the previous active connection; distinguish code revocation from
  revocation of a credential already issued, and report incomplete cleanup.
- Directory refresh as an independent read after save. Test-message submission
  requires an explicitly selected recipient and is a separate mutation.

This is the first implementation gate: review the matrix and pass provider
contract tests before wiring real management actions into the UI.

### P1.2: connect the approved interaction flow

Implement **Hub → pairing → identity confirmation → save → recipients** using
the reviewed contract. Keep failure and retry local to each step, suppress
stale responses after cancellation, and retain only non-sensitive input.
Show a required MCP restart/reload explicitly if activation cannot be automatic.

Provider/host work and UI work may be assigned to separate bounded workers
once their contract is stable. The primary agent reviews the combined diff
and runs final acceptance. Do not split ownership of the same active profile
or mailbox across workers.

### Acceptance and completion

Use disposable Hub/client profiles to verify successful enrollment, expired
or reused codes, wrong identity, TLS/authentication failures, save failure,
double submission, cancellation/expiry cleanup and restart/reload activation.
Prove that retries do not create duplicate enrollment or overwrite/revoke an
existing credential. A directory refresh failure after save must retain the
saved connection and permit read-only retry; an empty directory is not failure.

Finish with one explicit synthetic task round trip observed by an independent
recipient: correct route/identity, claim, terminal completion and acknowledgement.
If the recipient does not handle it within the bounded test, report timeout or
awaiting handling rather than offline status. Preserve failure evidence without
credentials or user message content in public documentation.

The provider, authenticated host adapter and browser wizard are locally
implemented in the alpha.6 / UI 0.1.7 candidate. The linked P1.2 record separates
contract/fixture checks from real DSH acceptance. The existing 0.1.6 preview
and 0.1.4 production installation remain separate from this isolated candidate.
Push, release and production deployment remain separate decisions.
