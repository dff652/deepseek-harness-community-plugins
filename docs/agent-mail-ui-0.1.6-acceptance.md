# Agent Mail UI 0.1.6 P0 acceptance

Date: 2026-09-09. Status: local candidate verified and installed in the isolated
evaluation preview; not pushed or released.
The production UI baseline remains `0.1.4`.

## Scope

Implements the first delivery step in the
[recipient and connection design](agent-mail-recipient-design.md): neutral
surfaces, a restrained blue primary action, collapsible diagnostics, separate
mailbox/recipient views and a dedicated composer that preserves unsent drafts
when returning to its previous view.

The recipient view uses the existing provider directory. It excludes the
current identity and `human@local`, shows connection state as unknown, supports
manual refresh and fills the composer when an identity is selected. Unknown
sender identity or a failed directory read prevents sending. An empty directory
and a failed directory read have different messages. No client presence is
inferred from directory membership.

Loading and retry states are visible. Failed sends preserve drafts; successful
sends followed by a failed refresh retain local sent records and explain that
submission succeeded. A synchronous guard prevents duplicate mutation calls.
Existing Quote, claim, task completion/acknowledgement and panel-local sent
history boundaries remain in scope.

## Exact candidate

`dff652-dsh-agent-mail-ui-0.1.6.tgz` has SHA-256:

```text
66a07bf1b57dd5cf41c38851c8878da0c2ea50b47cc0c684c63f16b6eab93ad6
```

The eight regular files are `LICENSE`, `NOTICE`, `README.md`, `client.js`,
`cordis.patch.yml`, `index.js`, `package.json` and `view.js`. The primary agent
checked the dry run, actual archive allowlist and equality of every packed
file with its source. The clean Web/headless profile gate independently
reproduced the same digest.

## Verified gates

| Gate | Result and scope |
|---|---|
| Node 22.19 and Node 24.19 | PASS, 100/100 portable tests on each |
| Generated client and public boundary | PASS |
| Dry pack and actual pack | PASS; exact eight-file allowlist and source byte equality |
| DSH rc.2 activation | PASS |
| Exact packed Web/headless clean profiles | PASS; install once, remove, no additional MCP child |
| Existing backend dispatcher through real MCP | PASS; claim renewal, premature acknowledgement rejection, Done/ack, all-mail state and missing-ID tail handling |
| Chrome 152 and Firefox 155 fixture browsers | PASS, 16 scenarios on each |
| Chrome 152 real DSH standalone and sidebar | PASS on the final archive, with disposable provider mailboxes |
| Real DSH recipient/composer/theme checks | PASS on both surfaces; provider roster equality, self/human exclusion, manual refresh, unknown presence, selected-recipient composition and draft preservation |
| Light/dark and 360px viewport | PASS on both real surfaces; inherited color scheme, visible blue/white primary action, panel bounds and input width |
| Independent source and browser review | PASS; separate source/generation/boundary review and 16 Chrome/Firefox scenarios |
| Sidebar without injected loader/context probe | PASS; normal workspace selection, Quote in visible composer, recipient-observed send, actual tab close/remount and manual refresh |

Fixture checks use synthetic in-memory responses for controlled failures and
retries. The separate real DSH checks cover actual provider delivery, claim,
premature acknowledgement rejection, terminal completion, duplicate-Done
guard, provider-validated acknowledgement after reload, two-session Quote
isolation, task/message sends and panel-local sent-record clearing. The
uninstrumented browser check separately verifies normal user controls.

The two theme checks set the document color scheme used by the DSH theme
presenter and verify that the panel inherits it; they do not claim an
OS-preference change. The narrow sidebar is 360px wide, and the standalone
panel is 328px wide within the same viewport. Resize assertions wait for the
host sidebar transition to finish before measuring bounds.

The sidebar uses better-sidebar 0.12.2, archive SHA-256
`fa24470fad91ca2c087a8b388c6542108a60410ce5b459471a0fbc0b384df1de`.
Its previously documented rc.6-family peer declaration remains an explicit
compatibility exception: these checks establish measured rc.2 behavior.

## Primary review findings

The first browser candidate completed the real DSH mailbox workflow, but
screenshot review found a primary-button fallback that could render light text
on a light background when DSH theme variables were absent. The final source
uses explicit blue/white colors, separates identity and actions into rows, and
contains input padding within the available width.

The primary agent also found that a saved draft could remain sendable after
identity or directory loss. Both the button and the send handler now require
a known current sender, loaded communication tools, a recipient still present
in the current directory and nonempty text. Tests exercise loss and recovery
without discarding the draft. An isolated negative control restoring the
previous send-readiness predicate fails both new guards as expected; this
control is a deliberately altered test bundle, not a historical release.

## Authorized preview upgrade

After the final gates and independent review passed, the existing isolated
preview was stopped before backup. The rollback copy passed regular-file hash
checks and SQLite integrity/count checks. The final archive was installed in
the same profile, and every installed package file matched the archive.

Status, diagnosis, inbox and recipient-list APIs passed after restart. Model
settings and credentials retained their hashes, all nine original session
event streams were preserved, and mailbox row counts matched the backup.
A read-only Chrome check opened an existing DSH session, the real recipient
view and the dedicated composer; an empty draft could not be sent.
The production service process was unchanged and remains on UI 0.1.4.
Protected backup and operational evidence remain outside the public tree.
Both disposable real-browser profiles were removed after acceptance; the
upgraded evaluation preview remains running.

## Remaining product scope

Hub enrollment, pairing codes, verification/save contracts, credential
management, heartbeat presence and an explicit test-message workflow remain
later provider/API work. They are not controls shipped by this P0 candidate.
The earlier 0.1.5 peer/model evidence remains tied to its recorded archives;
this interface change does not extend those results to a new model workflow.
