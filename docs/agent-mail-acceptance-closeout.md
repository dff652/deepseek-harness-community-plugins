# Agent Mail cross-host closeout

Date: 2026-09-11. This report traces each “passed” claim to protected local
evidence. It does not publish, deploy, or commit. Machine addresses, usernames,
homes, tokens and certificates stay outside this repository.

Candidates:

| Artifact | Version | SHA-256 | Packed files |
|---|---|---|---:|
| Agent Mail provider | `1.0.0-alpha.7` | `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98` | 117 |
| Unified DSH Agent Mail | `0.2.0` | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` | 9 |

Source commits at the gate: provider `bdaa0fa673103d7b54a97bbc1ad6641b47bade34`,
plugins `73699526ae7304c0f700bcd7ced6bd2a88380727`. Those commits do not include
this closeout. Publication, catalog changes and live upgrades remain separate.

## Delegation

The session that ran the isolation gate was asked to use one `luna-worker` for
Host B. That custom subagent type was not registered (available types were
`explore`, `general-purpose`, `plan`). One general-purpose subagent used the
same Host B ownership contract. The primary agent owned Host A, integration,
complete review and independent verification. A worker summary was not treated
as acceptance.

## Worker versus primary evidence

The Host B worker’s first `type=error` call used the B→A task, where Host B is
the origin. The provider rejected it with
`done/error must be sent by the assignee to the task origin` (exit code 5).
That worker item is **failed** and is not the final error result.

The primary agent retested the protocol constraint:

1. Host A (assignee) sent `type=error` for the claimed B→A task. The original
   B→A task became `failed` with task-basis evidence. Host A’s error
   notification remained `submitted` / `pending` with delivery-basis evidence.
2. Host A sent a new A→B error-path task. Host B claimed it as assignee and
   sent `type=error` to Host A. The original task became `failed`; the error
   notification stayed `submitted` / `pending`.

The Host B worker also recorded Hub disconnect `not_run` because the down
window was about three seconds and already closed when it polled. The primary
agent independently called `comm_sent` on both hosts while the Hub was down:
both returned `isError` with connection refused and no sent items. After Hub
restart both recovered the same message ids.

## Check trace

| Check | Final | Worker | Primary evidence |
|---|---|---|---|
| Archive digests and file counts | passed | n/a | Rechecked SHA-256 and packed-file counts against the candidate table |
| Native install each host | passed | Host B compile of `better-sqlite3` | Host A independent prefix; no copied `node_modules` |
| TLS SAN and CA pin | passed | `openssl s_client` verify 0 (ok), `insecure_tls=false` | Same SAN check on Host A; authenticated `connect test` ok |
| Disposable DSH: one MCP, one UI | passed | n/a | Profile dump: one `mcp-agent-mail`, one `dsh-agent-mail-ui`; no standalone UI package |
| Details before send | passed | `device_ip=null`, `connection=unknown` | Same payload from Host A MCP and UI status `clientPresence=unknown`, `autoWake=false` |
| Bidirectional send | passed | A→B received; B→A sent | A→B `remote:true`; B→A claimed on Host A |
| Sender isolation | passed | stranger sent=0, inbox=0 | Same JSON retained |
| Claim / done / ack | passed | claim+done+ack on A→B | Host A sent row `completed` / `acked` / task-basis; Host B done row `submitted` / `pending` / delivery-basis |
| Error vs notification | passed after retest | first B→A origin error **failed** | Assignee-sent error rows above |
| MCP restart | passed | new session still listed B→A | New Host A MCP process still listed A→B |
| Hub disconnect fail-closed | passed | worker `not_run` during down | Both hosts `isError` + connection refused |
| Hub restart recovery | passed | after-up history recovered | Host A recovered three sent ids including the original A→B task |
| Browser reload / auto receipts / polling pause | passed | n/a | `browser-cross-host.json` nine true flags; wide and narrow screenshots inspected |
| Cleanup and existing services | passed | Host B prefix removed; unrelated containers left running | Host A temp Hub/DSH/credentials removed; production user unit still active with the preflight PID; preview instance left running |

Unverified in this closeout: live catalog PR content (T2), production profile
bytes (T3), and any gate that was not re-run after this documentation pass.

## Completed documentation commits

Plugins repository, branch `main`: `9cd36ef` committed the closeout, release preparation, migration plan and status documents.

- `docs/agent-mail-unified-candidate.md`
- `docs/agent-mail-acceptance-closeout.md`
- `docs/agent-mail-release-tasks.md`
- `docs/agent-mail-release-preparation.md`
- `docs/agent-mail-production-migration-plan.md`
- `README.md` and `docs/project-status.md`

Commit message:
`docs: record unified Agent Mail 0.2.0 cross-host closeout`

Provider repository, branch `codex/agent-mail-enrollment`: `6bdcc67`.

- `docs/acceptance/sent-receipts-alpha7.md`

Commit message:
`docs: record alpha.7 cross-host isolated acceptance`

These documentation commits do not publish or deploy the candidates. Subsequent review corrections to the backup, retry, release-workflow and task-status instructions are recorded in the current documentation revision. Push, tag, Release, npm, catalog writes and production cutover remain separate.
