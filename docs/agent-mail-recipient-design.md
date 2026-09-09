# Agent Mail recipients and connection design

Date: 2026-09-09. Status: design proposal grounded in current source; not a
claim that enrollment, presence or connection management is implemented in
the DSH UI. The accepted visual direction is neutral surfaces, a restrained
blue accent, balanced spacing and collapsible diagnostic details.

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
bundle provider code, endpoints, homes or credentials. Existing candidate
archives and acceptance evidence remain unchanged by this design document.
