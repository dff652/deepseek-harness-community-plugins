# Agent Mail production migration and rollback plan

Status on 2026-09-11: documentation and read-only inspection only. This file
is not authorization to install, stop or restart services, edit profiles,
create backups, commit, push, publish or deploy. Isolation acceptance of the
unified candidate is not live production acceptance.

Host A is the machine that currently runs the production DeepSeek Harness
(DSH) web unit. Host B is a separate machine used only as a real recipient
during later live acceptance. This public plan uses Host A/B and
`/absolute/path/to/...` placeholders. Machine paths, unit names, identity
strings and backup locations stay in the protected local handoff.

Related records: [unified candidate](agent-mail-unified-candidate.md),
[package README](../packages/dsh-agent-mail/README.md),
[install/upgrade/rollback](install-upgrade-rollback.md),
[task list](agent-mail-release-tasks.md). Do not treat those historical
install commands as a live-profile instruction.

## Scope

In scope for a later authorized cutover:

- Independently install provider `1.0.0-alpha.7`.
- Remove the standalone UI package, then add the unified tarball
  `@dff652/dsh-agent-mail@0.2.0`.
- Keep the existing mailbox home, Harness identity and connection
  configuration.
- Prove the live web profile with one MCP row, one UI row, and the live
  acceptance matrix below.

Out of scope unless separately authorized:

- npm publication, GitHub Release, catalog changes, git commit or push.
- Enabling a production Hub, enrollment, or connection-management host that
  is not already part of the live profile.
- Changing Host B TSPlatform, ollama, or any unrelated service.
- Rolling the DSH core off `0.1.1-rc.2`.
- Using the Host A preview instance or isolation evidence homes as
  production.

## Current Host A baseline (read-only, 2026-09-11)

Facts below were taken from the running user unit, unit files, on-disk
profile manifests, installed `package.json` versions and the provider
runtime tree. Live `dsh --dump-config` was not executed: that command
rewrites the profile root config file even though it does not boot the
app or evaluate `!!js`. The composed loader rows are therefore
**inferred** from installed bundles, not printed from a live dump.

| Component | Live Host A | Notes |
|---|---|---|
| DSH runtime | `0.1.1-rc.2` | Started by a user systemd unit as `dsh web` on the live home. The default `dsh` wrapper also points at that live home. |
| MCP plugin | `@dff652/dsh-agent-mail@0.1.1` | Exact tarball pin in the web profile. Loader id `mcp-agent-mail`, `serverName: agent-mail`. |
| UI plugin | `@dff652/dsh-agent-mail-ui@0.1.4` | Separate compatibility package. Loader id `dsh-agent-mail-ui`. |
| Provider | `1.0.0-alpha.4` | Launched through `DSH_AGENT_MAIL_COMMAND`. Native `better-sqlite3` is built for Node 20; DSH itself uses Node 24. |
| Mailbox | Existing initialized home | `DSH_AGENT_MAIL_HOME` is an absolute initialized provider home. Plugin removal does not delete it. |
| Identity | Non-human Harness id | `DSH_AGENT_MAIL_ID` is set in the unit drop-in. It is not `human@local`. |
| Connection | Local mailbox, Hub URL unset | Mailbox `remote_enabled` is false. No `DSH_AGENT_MAIL_HUB_URL` is set on the production unit. Token files stay outside the plugin. |
| Other web bundles | Private AgentMemory, better-sidebar, plugin market | Git Graph is not in the live web profile. Do not add or remove these during Agent Mail cutover. |
| Headless profile | Core DSH only | No Agent Mail bundles. Do not install the unified package there as part of this cutover. |

The isolation migration gate used MCP `0.1.1` plus UI `0.1.7`. Live Host A
still runs UI `0.1.4`. A Host A preview instance runs a different home,
identity, mailbox and UI `0.1.7` / provider `1.0.0-alpha.6` combination.
That preview is not production and must not be stopped for this plan.

An older DSH `0.1.0-rc.6` tree remains on Host A from a previous core
migration. It is **not** the rollback target for this unified cutover.

Unverified in this read-only pass (do not treat as green):

- Live composed YAML from `dsh --dump-config`.
- Current MCP tool catalog of the running child.
- Browser rendering of the live mailbox.
- Host B's production Agent Mail / DSH versions.
- Health of the existing TLS front door (not probed).

## Path and configuration classes

Keep these as deployment-owned locations. A later profile patch that
replaces the MCP row must repeat the full `config` object.

| Class | Live role | Cutover rule |
|---|---|---|
| `/absolute/path/to/dsh` | Wrapper that execs the reviewed DSH `0.1.1-rc.2` binary | Default `DSH_HOME` on Host A is the **live** home. Never run `dsh plugin` without an explicit home and authorization. |
| `/absolute/path/to/dsh-home` | Live DSH home (`profiles/web`, settings, credentials, sessions) | Copy as a backup. Restore only the DSH/plugin side during rollback. |
| `/absolute/path/to/agent-mail-mcp` | Stdio wrapper used as `DSH_AGENT_MAIL_COMMAND` | Point at a **new** alpha.7 tree. Keep the alpha.4 wrapper as a file backup. |
| `/absolute/path/to/agent-mail-home` | `DSH_AGENT_MAIL_HOME` / `AGENT_MAIL_HOME` | Do not `agent-mail init` on it. Do not copy a preview or isolation home over it. |
| Harness identity | `DSH_AGENT_MAIL_ID` / `AGENT_MAIL_ID` | Keep the existing non-human value. |
| Roster | `agents.json` in the mailbox home | Keep. Do not import isolation identities. |
| Connection config | Mailbox `config.json` plus optional `token_file` / `ca-file` | Keep. Current live remote Hub is unset. Do not run `connect set` with test Hub values. |
| Provider runtime | Independently installed `node_modules/agent-mail` | New directory for alpha.7. Do not overwrite the alpha.4 tree in place. |

## Publication versus production cutover

These are separate owner-authorized operations:

1. Documentation or product commits.
2. Push, tag, GitHub Release, npm, catalog.
3. Production backup creation.
4. Production cutover and live acceptance.

A local exact tarball that already matches the reviewed SHA-256 may be used
for production **only after a distinct production-operation authorization**.
Publication is not that authorization. Using a published download still
requires the same production authorization, plus a byte check that the
download matches the hashes below. If published bytes differ, stop.

T4 may publish; T5 may cut over. Neither is implied by this SOP.

## Candidate artifacts

Install only these reviewed bytes. Recompute SHA-256 immediately before use.

| Artifact | Version | SHA-256 | Packed files |
|---|---|---|---:|
| Agent Mail provider | `1.0.0-alpha.7` | `8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98` | 117 |
| Unified DSH Agent Mail | `0.2.0` | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` | 9 |

Keep the live rollback artifacts beside them:

| Artifact | Version | SHA-256 |
|---|---|---|
| MCP bundle currently live | `0.1.1` | `03664058d3a7c56d9a151f3a57091d06102d564f66b8cb2efe5f432fa5c18e0d` |
| Standalone UI currently live | `0.1.4` | `ed87f8fca7db9a153e0105a4c89c2b8dca2c108456c85bfb81024c85735fe1e9` |
| Provider currently live | `1.0.0-alpha.4` | `f0d6316ec83a989f6d410c71e5ccd3a9e0fdb92f268f94cd82f901ae2bc0b3b2` |
| DSH runtime currently live | `0.1.1-rc.2` | `47ec05f45ada5ab87779ae18a90456b5ebff5421dc0ff5c179677d65e1c16057` |

Do not install preview UI `0.1.7` or provider `1.0.0-alpha.6` into
production as a substitute for the rows above.

## Backup objects (create only after later authorization)

Actual backup creation is a T5 step. The backup set is:

1. **Start units and wrappers.** The Host A DSH user unit, its Agent Mail
   drop-in, the trusted-LAN proxy/socket units if present, and the `dsh` /
   `agent-mail-mcp` wrappers. Copy files; do not rewrite addresses.
2. **Live DSH home.** The entire live home, including `profiles/web`
   (`package.json`, lockfile, `cordis.yml`, `cordis.patch.yml`, installed
   modules), settings, credentials, sessions and storages.
3. **Exact current plugin tarballs** used by the live `file:` pins, with
   SHA-256.
4. **Provider alpha.4 runtime tree and its original tarball**, plus the
   current stdio wrapper.
5. **Mailbox home.** The entire `/absolute/path/to/agent-mail-home`
   directory (`store.sqlite`, `agents.json`, `config.json`, `policy.yaml`,
   schemas, logs, locks, export). Record file names, sizes and a sqlite
   integrity result. Do not copy message bodies into git or this
   repository.
6. **Non-secret environment names and values.** `DSH_HOME`,
   `DSH_AGENT_MAIL_COMMAND`, `DSH_AGENT_MAIL_HOME`, `DSH_AGENT_MAIL_ID`,
   and whether `DSH_AGENT_MAIL_HUB_URL` is set.
7. **Checkpoint ledger.** SHA-256 of mailbox `store.sqlite`, web
   `package.json`, wrappers and unit files at T0 and after each later
   step.

Do not include: the Host A preview home, isolation evidence homes, test
Hub certificates, test tokens, or Host B runtime data.

Prefer a stopped, consistent copy of the live DSH home. If a backup is
taken while DSH is running, record that it is crash-consistent only and
re-copy sqlite after stop before using it as a rollback image.

## How to verify a backup

A backup is not verified by existing. For each object:

- Recompute SHA-256 of every tarball and confirm it matches the table
  above.
- `tar -tzf` the provider archive (117 files) and the unified archive
  (9 files).
- On the **copy** of `store.sqlite`, run `PRAGMA integrity_check;` and
  record table counts. Do not query message bodies into logs.
- Diff unit/wrapper/drop-in copies against the live files; they must be
  byte-identical at T0.
- Confirm the copied web `package.json` still lists Agent Mail `0.1.1`,
  UI `0.1.4`, and the unrelated live bundles.
- Restore the MCP `0.1.1` and UI `0.1.4` tarballs into a **disposable**
  `DSH_HOME` and confirm they add. That proves the rollback bytes are
  installable. Do not use the live home for this check.
- Restore the mailbox copy into a disposable directory and open it
  read-only with the alpha.4 provider. Do not point production
  `DSH_AGENT_MAIL_HOME` at the copy.

If any check fails, do not start cutover.

## Rollback preconditions

Rollback is allowed only when all of the following hold:

- Production-operation authorization for rollback exists (separate from
  the cutover authorization if the owner split them).
- The verified T0 backup still exists and the disposable restore check
  passed.
- The Host A preview instance is still untouched.
- The operator has the checkpoint ledger and knows whether new production
  mail was accepted after T0.

Mailbox rule: **never restore `store.sqlite` from T0 after new mail has
been accepted.** Plugin, provider and unit rollback must keep the newer
mailbox home, identity and connection files. If a step before any new
mail fails and the sqlite digest is still the T0 digest, restoring the
mailbox copy is optional and should still be avoided unless the file was
damaged.

Do not roll this cutover back to DSH `0.1.0-rc.6`, preview UI `0.1.7`,
or an isolation profile.

## Exact candidate install sequence

Provider first, independently of DSH plugins. Then, with production DSH
stopped, remove the standalone UI and add the unified tarball. Keep
mailbox home, identity and connection configuration unchanged.

### A. Side-by-side provider install (no live process change)

Use Node 20 for the provider, not the DSH Node 24 PATH.

```bash
sha256sum /absolute/path/to/agent-mail-1.0.0-alpha.7.tgz
# expect 8d541c25756f7eb566ee6a2d7993f1314345a3ee57515c435245e61877106b98

mkdir -p /absolute/path/to/provider-alpha7
# Node 20, argv only, shell: false in any wrapper
npm install --prefix /absolute/path/to/provider-alpha7 \
  /absolute/path/to/agent-mail-1.0.0-alpha.7.tgz
```

Expected: `node_modules/agent-mail/package.json` version `1.0.0-alpha.7`,
native `better-sqlite3` addon present, `dist/mcp/stdio.js` present.
Write a **new** stdio wrapper that execs Node 20 and that path with an
empty `args` array. Do not yet change `DSH_AGENT_MAIL_COMMAND`.

Do not run `agent-mail init` against the production home. Do not copy
`node_modules` from Host B or from the preview tree.

### B. Plugin cutover (production DSH stopped; live home explicit)

```bash
export DSH_HOME=/absolute/path/to/dsh-home
sha256sum /absolute/path/to/dff652-dsh-agent-mail-0.2.0.tgz
# expect 9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf

dsh plugin --profile web remove @dff652/dsh-agent-mail-ui
dsh plugin --profile web add -w /absolute/path/to/dff652-dsh-agent-mail-0.2.0.tgz
```

The unified package has the same name as the live MCP bundle, so the add
replaces `0.1.1` with `0.2.0` and inserts the UI row from that package.
Adding `0.2.0` while `@dff652/dsh-agent-mail-ui` remains installed fails
closed with a duplicate loader id `dsh-agent-mail-ui`.

After add, the web profile must contain exactly one `mcp-agent-mail` row
and one `dsh-agent-mail-ui` row. The UI row name must be
`@dff652/dsh-agent-mail`. It must not name `@dff652/dsh-agent-mail-ui`.
Unrelated bundles must still be present.

`--dump-config` may be used on this already-authorized, stopped live
home. It rewrites the empty profile root file. Record that file's digest
before and after. Prefer copying the home and dumping the copy if the
operator wants a no-write check.

### C. Software rollback (mailbox retained)

```bash
export DSH_HOME=/absolute/path/to/dsh-home
dsh plugin --profile web remove @dff652/dsh-agent-mail
dsh plugin --profile web add -w /absolute/path/to/dff652-dsh-agent-mail-0.1.1.tgz
dsh plugin --profile web add -w /absolute/path/to/dff652-dsh-agent-mail-ui-0.1.4.tgz
```

Restore the alpha.4 stdio wrapper / `DSH_AGENT_MAIL_COMMAND` and start
the previous unit files. Do not restore mailbox sqlite unless it is
still the T0 digest and the owner explicitly wants that copy.

## Cutover steps

Each step is later T5 work. T3 does not execute them.

### Step 0 — Authorization and window

- **Checkpoint:** Written production-operation authorization; maintenance
  window; Host A preview instance identified and marked do-not-kill;
  Host B TSPlatform/ollama marked do-not-touch.
- **Expected:** Scope is Host A Agent Mail provider + web plugins only.
- **Failure rollback:** Do not start. No production change.
- **Mailbox:** Untouched.

### Step 1 — Record live facts

- **Checkpoint:** Unit ActiveState, MainPID, NRestarts, web
  `package.json`, provider `package.json` version, mailbox sqlite
  digest and integrity, wrapper digests, Hub URL presence.
- **Expected:** Matches the baseline table. Preview still listening.
- **Failure rollback:** Stop if the live baseline drifted. Re-inspect.
- **Mailbox:** Read-only.

### Step 2 — Create and verify backups

- **Checkpoint:** Backup verification checklist above, all green.
- **Expected:** T0 ledger written to the protected local directory, not
  this repository.
- **Failure rollback:** Do not continue.
- **Mailbox:** Copied; live file remains the source of truth.

### Step 3 — Install provider alpha.7 side by side

- **Checkpoint:** New tree version `1.0.0-alpha.7`; tarball digest;
  Node 20 wrapper written but not referenced by the unit.
- **Expected:** Production DSH still on alpha.4. Preview unchanged.
- **Failure rollback:** Delete only the new unused tree. No unit change.
- **Mailbox:** Untouched. If this step is the first to fail, sqlite
  digest must still equal T0.

### Step 4 — Stop production DSH only

- **Checkpoint:** Production unit inactive; preview still up; mailbox
  sqlite digest recorded as T0-stop.
- **Expected:** Only the production DSH unit (and its proxy, which
  depends on it) is down. Do not stop unrelated user units.
- **Failure rollback:** Start the same unit with unchanged files.
- **Mailbox:** No writer. Digest must match T0-stop.

### Step 5 — Switch `DSH_AGENT_MAIL_COMMAND` to alpha.7

- **Checkpoint:** Drop-in or wrapper now points at the new Node 20
  stdio path; `DSH_AGENT_MAIL_HOME` and `DSH_AGENT_MAIL_ID` unchanged;
  Hub URL still unset unless it was already set.
- **Expected:** Alpha.4 wrapper file still present as a backup.
- **Failure rollback:** Restore the drop-in/wrapper from T0 and start
  DSH. Mailbox remains.
- **Mailbox:** Do not run `connect set` or `init`.

### Step 6 — Remove standalone UI, add unified `0.2.0`

- **Checkpoint:** Web `package.json` dependencies: `@dff652/dsh-agent-mail`
  is the `0.2.0` tarball; `@dff652/dsh-agent-mail-ui` is absent;
  AgentMemory / sidebar / market pins unchanged.
- **Expected:** Composed config has exactly one MCP row and one UI row
  naming `@dff652/dsh-agent-mail`.
- **Failure rollback:** Step C plugin rollback, then Step 5 reverse,
  then start. If sqlite digest is still T0-stop, mailbox restore
  remains optional.
- **Mailbox:** Plugin add/remove must not change sqlite. If it does,
  stop and investigate; do not continue.

### Step 7 — Start production DSH

- **Checkpoint:** Unit active, NRestarts=0 after start, previous
  trusted-host / proxy configuration unchanged, MCP child uses alpha.7.
- **Expected:** Web profile serves the mailbox UI. `comm_sent` and
  `comm_agent_details` exist. Preview still up.
- **Failure rollback:** Stop DSH, plugin rollback, provider wrapper
  rollback, start. Keep mailbox if digest changed only due to provider
  startup with no user mail — compare with T0-stop; if the provider
  rewrote sqlite without new user messages, prefer keeping the newer
  file unless it fails integrity.
- **Mailbox:** Integrity must pass. Do not replace with T0 if the
  digest moved.

### Step 8 — Live acceptance matrix

See the next section. Isolation evidence must not be copied in as a
pass.

- **Failure rollback:** If no new user/test mail was accepted and sqlite
  is still T0-stop, full software rollback. If any new mail was
  accepted, software-only rollback and keep mailbox.
- **Mailbox:** Test messages are new mail. After the first accepted
  test send, T0 sqlite is no longer a safe restore image.

### Step 9 — Observation

- **Checkpoint:** Record live provider/plugin versions, row counts, and
  how long T0 software backups will be retained.
- **Expected:** Daily entry uses the unified package. Rollback bytes
  retained for the agreed window.
- **Mailbox:** Retain the live home. Do not revert test-message cleanup
  by restoring T0 sqlite; delete only the marked test messages if the
  owner wants them gone.

## Live acceptance matrix

Isolation, disposable-profile, and Host A preview results are not a
substitute. Run this matrix on the production web profile after Step 7,
using uniquely marked, non-executing test messages. Exactly one MCP row
and one UI row must already hold.

| # | Case | How | Expected | Fail / rollback |
|---|---|---|---|---|
| L0 | Row shape | On the authorized stopped-or-live home, confirm composed config | Exactly one `id: mcp-agent-mail` and one `id: dsh-agent-mail-ui`. UI `name` is `@dff652/dsh-agent-mail`. No remaining `@dff652/dsh-agent-mail-ui` package. | Stop. Plugin rollback. No mail restore if sqlite moved. |
| L1 | Submit feedback | From the production mailbox UI, send one marked test message to a real roster recipient | UI leaves compose, shows the sent view, status `submitted` / 「已提交」. The same id appears through `comm_sent`. Inbox of the sender does not invent a receive. | If send failed, no new row; safe to retry once. If send succeeded, never click send again for the same marker. |
| L2 | Submit succeeded but refresh failed | After a successful send, the UI refresh of inbox/sent/details fails (forced by a brief MCP/Hub interruption, or observed naturally) | Banner is 「消息已提交到邮箱，但刷新失败；请手动刷新确认状态。」 (or the claim/ack variant 「操作已成功，但刷新失败…」). Mailbox has exactly one new message for that marker. Manual refresh recovers the row. A second send is forbidden. | If two messages exist for one marker, stop and keep mailbox. Software rollback only after owner review. |
| L3 | Durable history | Reload the browser; close and reopen the panel | The marked sent item remains. History comes from `comm_sent`, not from a panel-only list. Device name/IP stay unknown. | If history vanishes, provider is not alpha.7 or MCP row is wrong. Do not restore sqlite to “fix” a UI bug. |
| L4 | Real recipient claim / done / error / ack | A real assignee client — not the isolation homes — claims the task, then sends `done` on one thread and `error` on a **second** marked task. The **assignee** must send `error` to the origin; the origin must not send `error` for the assignee. Then ack the originals | Original tasks show durable task state (`claimed` → `completed` / `failed`). The done/error notifications have their own delivery receipts (`submitted` / pending). Origin UI updates without a model wake. | Isolation Hub, preview identity, or origin-sent `error` is a failed case even if the UI looks green. |
| L5 | Restart recovery | Restart the production DSH unit once after L1–L4. Do not restart the preview instance | Unit returns with NRestarts=0. Same MCP/UI rows. Sent history and task states return. Mailbox integrity passes. Unrelated bundles still load. | If restart loops, stop and software-rollback. Keep mailbox. |

Recipient topology: live Host A is currently a local mailbox with Hub
URL unset. A real recipient is therefore either (1) a second non-human
identity already in this mailbox roster, talking to the **same**
production home, or (2) Host B over a production Hub that the owner
separately authorizes. Do not enable a Hub as a side effect of this
plugin cutover. Do not reuse the isolation or preview test Hub. Do not
change Host B TSPlatform or ollama.

Error rule: the failing task's assignee sends `type: error` (or the
provider's equivalent error completion) to the origin. An origin-side
error send does not satisfy L4.

## Stop conditions

Stop, and do not enlarge scope, when any of these occur:

- Candidate or rollback tarball SHA-256 mismatch.
- Duplicate loader id `dsh-agent-mail-ui`.
- Web profile lost AgentMemory, better-sidebar or market, or gained Git
  Graph / preview patches.
- Provider child started under Node 24 and the native addon fails.
- `DSH_AGENT_MAIL_HOME` or `DSH_AGENT_MAIL_ID` changed, or a Hub URL /
  token_file from preview/isolation appeared.
- Mailbox sqlite digest changed during plugin add/remove.
- Host A preview instance on its existing port disappeared after an
  operator action in this window.
- Host B TSPlatform/ollama would need a change to proceed.
- New mail has been accepted and someone proposes restoring T0 sqlite.
- Published bytes are proposed in place of the hashed local candidate
  without a digest check.
- Any step lacks its own authorization.

## Rollback ownership

| Object | Owner | Default action on failure |
|---|---|---|
| Production DSH unit start/stop | Deployment owner / T5 after authorization | Restore T0 unit files and start. |
| Web plugin pins | Same | Restore MCP `0.1.1` then UI `0.1.4`. |
| Provider command | Same | Point `DSH_AGENT_MAIL_COMMAND` at the alpha.4 wrapper. Keep the alpha.7 tree for inspection. |
| Mailbox home | Deployment owner; not the plugin | Keep live sqlite after any accepted mail. T0 sqlite is a last-resort integrity rescue only. |
| Preview instance | Out of scope | Do not restart, migrate or use it as rollback. |
| Host B | Out of scope for software rollback | Do not revert Host B to “fix” Host A. |
| Publication | T4 / owner | Not rolled back by a production failure. |

T3 writes this SOP only. T5 executes a later authorized window and
records versions, digests and the live matrix without copying secrets
or mailbox bodies into this repository.
