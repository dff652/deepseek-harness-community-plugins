# Agent Mail delivery and UI review

Review date: 2026-09-09. This record contains sanitized findings only.
Deployment addresses, credentials, mailbox paths, message bodies and message
identifiers are intentionally kept outside the public source tree.

## Observed baseline

- The local checkout and remote main both resolved to `13b6510`.
- Live DSH was `0.1.1-rc.2`, with Agent Mail bundle `0.1.1` and UI `0.1.4`.
- Authorized HTTPS login and the right-panel mailbox rendered successfully
  using the existing entry mapping and valid TLS. The audit machine's normal
  DNS did not resolve that entry; no DNS changes were made.
- Mail status reported no missing tools and reuse of the existing MCP child.
  Database integrity passed. The service was active with no recorded restarts.
- All 98 portable tests and `npm run check:repo` passed before modifications.
- The owner authorized one non-executing test message to the Codex recipient.
  Browser Send succeeded, and a separate MCP process using the recipient
  identity and the same mailbox read exactly one matching message, with the
  expected sender, recipient, body marker and pending delivery status.

This is evidence of browser-to-mailbox-to-recipient-MCP delivery. It does not
establish that an ordinary Codex conversation was connected, notified, reading
mail or executing tasks. At the baseline, the inspected Codex configuration
had no Agent Mail server. The provider's recipient list comes from its roster,
not from client presence. The UI has no automatic wake or push delivery.

Marketplace PR [#2988](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2988)
was verified as merged, with merge time 2026-08-24. Earlier project documents
that still called it pending were stale. This observation alone is not a new
marketplace installation acceptance.

## UI findings and accepted changes

| Finding | Required behavior |
|---|---|
| A one-row list consumes a large blank area | Size short lists to content; allow accessible resizing when inspecting a thread |
| Internal thread ID is the main heading | Use a readable subject and participants; put identifiers in expandable details |
| DONE, unread and Ack appear contradictory | Separate task outcome from delivery acknowledgement; do not claim human read receipts |
| Static recipients look like connected clients | Explain that connection state is unknown and sending deposits mail without waking a client |
| English implementation terms dominate the Chinese workflow | Use consistent Chinese action labels and useful state descriptions |
| Message mode still says Send read task | Match the send label to message/task type |
| No refresh explanation or sent-message navigation | Explain manual refresh; provide honestly scoped sent records without inventing provider history |

The existing right-panel integration remains appropriate. Preserve the
standalone fallback, selected-conversation Quote, failed-claim behavior,
terminal-task acknowledgement guard and human-only approval boundary.

## Execution and validation

The owner requested documentation, implementation and primary-agent review.
A luna-worker owns the UI package and its focused unit/browser tests. The
primary agent owns documentation, private client integration, complete diff
review, exact archive checks and final acceptance. An independent verifier
reviews the completed work before handoff.

UI `0.1.5` is a new local candidate; the released/live `0.1.4` evidence does
not qualify changed bytes. Record candidate checks and digest separately.
Commit, push, release and live UI deployment are separate transitions.

The [0.1.5 candidate acceptance](agent-mail-ui-0.1.5-acceptance.md) records
the implemented changes, exact archive and validation results.

Automatic wake, a presence registry and persistent sent-history/receipt APIs
require a separate provider or host contract. This UI change must display
those limitations explicitly instead of fabricating those capabilities.

See [receiving-client connection](agent-mail-client-connection.md) for the
portable configuration and verification procedure. Actual machine settings
and rollback configuration remain outside this repository.
The [capability comparison and roadmap](agent-mail-capability-roadmap.md)
define what the full provider supplies, what the DSH UI exposes, and the
remaining client, browser, release and automation acceptance tasks.

### Receiving-client result

The owner-authorized follow-up added the Agent Mail stdio server to the private
user-level Codex configuration, preserving all prior settings and a protected
backup. The tool allowlist excludes human approve/reject operations.

A fresh, ephemeral **Codex app-server** runtime loaded that saved configuration
and reported the server connected. Its MCP tool route read the exact earlier
authorized browser canary, claimed it, acknowledged it and verified its removal
from the unacknowledged inbox. All five checks passed. No model turn was run,
no new test message was sent, and no unrelated delivery was modified.

This establishes a configured Codex receiving client in addition to the
earlier direct-provider test. It does not establish a hot reload of the
already-running owner conversation or automatic notification/task execution.
