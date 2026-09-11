# DSH Agent Mail bundle

Unified DeepSeek Harness plugin for an independently installed Agent Mail
`agent-mail-mcp` executable. One installation mounts one official MCP client
and the mailbox UI. The provider executable, database and credentials remain
outside this package. Automatic wake is not provided here.

## Development candidate

Version `0.2.0` is an unreleased unified candidate for DSH `0.1.1-rc.2`.
The exact MCP peer remains `@deepseek-ai/dsh-mcp-client@0.1.1-rc.2`.
Persistent sent receipts and recipient details use the unreleased provider
`1.0.0-alpha.7`, exposing
`comm_sent` and `comm_agent_details`; older providers retain their existing
mail operations but cannot supply those new views. The historical alpha.4
fixture below remains a backward-compatibility gate, not a claim that alpha.4
supports the new APIs.

The web profile shows the mailbox. A headless profile still exposes the MCP
tools without loading the browser client. A separate UI installation is no
longer required. The optional authenticated connection-management host remains
an independently configured provider service.

See [unified migration and acceptance](../../docs/agent-mail-unified-candidate.md).

## Deployment contract

The DSH service must define:

| Variable | Role |
|---|---|
| `DSH_AGENT_MAIL_COMMAND` | Absolute path to reviewed `agent-mail-mcp` |
| `DSH_AGENT_MAIL_HOME` | Absolute initialized Agent Mail home |
| `DSH_AGENT_MAIL_ID` | Distinct non-human identity, never `human@local` |
| `DSH_AGENT_MAIL_HUB_URL` | Optional remote Hub URL |

Initialize a disposable project with `agent-mail init --path /absolute/path/to/project`
and set `DSH_AGENT_MAIL_HOME` to the initialized home that command created.
Put every participating identity in that home's roster. Missing command, home,
or identity fails closed. Two live DSH participants need different
`serverName` values and different `DSH_AGENT_MAIL_ID` values; they may share a
home only as separate mailboxes, not as one shared agent.

Remote Hub tokens use the provider `token_file` (`agent-mail connect set
--hub-url URL --token-file PATH`). Do not put a bearer token, certificate, or
provider data directory in this package, a committed patch, or a published
artifact.

A later profile/home patch that replaces this row must repeat the full
`config` object. The default namespace is `agent-mail`. Override `serverName`
when a second instance is installed beside the first.

Install an exact package version or reviewed tarball into a disposable DSH
profile first. A source checkout is not release acceptance.

```bash
dsh plugin --profile <profile> add -w ./dff652-dsh-agent-mail-0.2.0.tgz
dsh --profile <profile> --dump-config
```

Remove the bundle without deleting the separately managed provider or its
data:

```bash
dsh plugin --profile <profile> remove @dff652/dsh-agent-mail
dsh --profile <profile> --dump-config
```

Keep the prior reviewed tarball and digest before an upgrade so the same
commands can restore it if acceptance fails.

### Configuration-only activation check

From a repository checkout, the package-specific DSH negative activation check
requires a reviewed DSH runtime and fails clearly if `dsh` is unavailable. The
script is intentionally kept out of the published package. It uses a temporary
DSH home and never starts a provider or touches a live profile:

```bash
node tests/dsh-agent-mail-activation.acceptance.mjs
```

The check covers unset, blank and relative command and home values, and it
refuses `human@local` as the Harness identity. It is kept outside `npm test`
because CI environments without DSH must not silently skip real activation
acceptance.

## Identity and approval

`human@local` is a human-only identity. This bundle refuses it as the Harness
`AGENT_MAIL_ID` when the row is activated. A non-human Harness identity cannot
approve or reject a write effect.

Provider documentation says human approval tools are registered only for
`human@local`. The historical `1.0.0-alpha.4` fixture advertises
`comm_approve` and `comm_reject` to every identity; execution rejects
non-human callers with exit code 6. This bundle freezes that discovery
mismatch and tests the execution denial. It does not hide the two tools and
does not run Harness as `human@local` to make them succeed.

## Expected model-visible names

```text
mcp__agent-mail__comm_send
mcp__agent-mail__comm_inbox
mcp__agent-mail__comm_sent
mcp__agent-mail__comm_agent_details
mcp__agent-mail__comm_claim
mcp__agent-mail__comm_ack
mcp__agent-mail__comm_list_agents
mcp__agent-mail__comm_approve
mcp__agent-mail__comm_reject
mcp__agent-mail__comm_approvals
mcp__agent-mail__comm_tail
mcp__agent-mail__comm_events
mcp__agent-mail__comm_diagnose
```

The first MCP milestone is asynchronous send/inbox/claim/done/ack. Automatic
wake, session injection, wake polling bridges, and starting DSH, Codex, Claude, or
Grok when mail arrives are a separate native-integration milestone and are
not provided here.

## Package contract

The package declares `dsh.bundle.patch` in `package.json` and pins the official
MCP client as an exact peer dependency. Deployment-specific command paths,
provider homes, identities, endpoints and credentials stay outside this
package.

The package includes its MIT [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE) so
those notices travel with every independently distributed tarball.
