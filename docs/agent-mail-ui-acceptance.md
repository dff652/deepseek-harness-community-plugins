# Agent Mail UI interaction acceptance

Date: 2026-09-05. Candidate: `@dff652/dsh-agent-mail-ui@0.1.3`.

This records scoped interaction acceptance, not full release approval. The
subsequent [full-range review and release plan](agent-mail-ui-release-plan.md)
records three additional P2 findings and a live/runtime baseline difference.

## Scope

The MCP bundle and UI package remain independently installable. The UI
reuses the existing MCP tools. This candidate fixes the task completion
action's dependency on a new-message draft, explains Ack prerequisites and
shows claim failures. It does not add automatic wake, polling, push delivery
or human approval execution.

The reviewed Agent Mail alpha.4 provider exposes `delivery_status` and
`effect_level` in inbox rows. Its `comm_tail` messages omit task and thread
IDs, so a terminal message in a thread cannot by itself prove which task
completed. Provider rejection remains authoritative for task actions.

Done uses a separate completion summary, initially `done`. After a successful
Done for the selected task, Ack becomes available. For tasks completed in
another session, **Check & Ack** explicitly asks the provider to validate the
terminal state and acknowledge the delivery. The UI does not silently treat
a thread's unrelated terminal message as evidence. Already acknowledged and
outbound messages can be opened without attempting a claim; mailbox rows
and the unread filter are disabled while requests are in flight.

## Current candidate evidence

Independent final review reran the portable suite on Node `22.19.0` and
`24.19.0`: **95/95 passed on each runtime**, including 18 UI tests. The public
repository boundary check and real MCP dispatcher acceptance also passed.

The exact eight-file `dff652-dsh-agent-mail-ui-0.1.3.tgz` has SHA-256:

```text
a148fe7c4e7710eb6cd8e35443ab15d96195d54ffc24c2d5a552b5b2d46fcef8
```

The clean-profile gate independently packed the same digest and passed
Web/headless install, one config entry, removal and no MCP spawn. It used
Node `24.19.0`, pnpm `11.7.0` and DSH `0.1.1-rc.2` from the reviewed DSH
tarball whose SHA-256 is
`47ec05f45ada5ab87779ae18a90456b5ebff5421dc0ff5c179677d65e1c16057`.

The real MCP dispatcher check passed claim renewal, premature Ack rejection,
Done followed by Ack, the alpha.4 tail payload shape and claim failures.
The harness used Node `24.19.0`; the separately managed alpha.4 provider used
its matching Node `20.19.2` native-addon runtime. Its MCP entry SHA-256 matched
the reviewed fixture. No provider runtime was rebuilt or changed. All test
mail was stored in a disposable home.

The main reviewer also installed the exact UI archive with the companion
MCP bundle into a fresh DSH Web profile and drove Firefox `155.0` headlessly.
The real standalone drawer passed:

- opening and claiming the synthetic incoming task;
- Ack disabled before completion, and Check & Ack rejected by the provider;
- Done with its default summary while New remained closed;
- duplicate Done disabled after success;
- reloading the browser, then using Check & Ack to acknowledge the completed
  task despite the cleared local completion cache; and
- an empty unread inbox after acknowledgement.

The disposable DSH process, sender session and mailbox were cleaned up after
the check. No model key was configured and no model turn was started. This
establishes Firefox standalone acceptance for the archive above; full DSH
better-sidebar interaction and Chrome acceptance remain unverified for these
bytes.

The reproducible fixture browser regression passed in Firefox `155.0` with
geckodriver `0.37.1` and React/ReactDOM `18.3.1` UMD assets: sidebar
registration with no duplicate drawer, Done without a New draft followed by
Ack, standalone mounting, and a visible claim failure with acknowledgement
blocked. Its synthetic tail responses omit task/thread IDs as alpha.4 does.
This complements the real DSH standalone run; it is not proof of the real
better-sidebar plugin's full integration.

## Reproduce

Use a supported Node runtime and a reviewed provider executable. Browser
checks require a separately installed browser and test driver; they are not
part of the portable `npm test` suite.

```bash
npm test
npm run check:repo
npm run test:activation:agent-mail-ui
npm run test:clean-profile:agent-mail-ui
DSH_AGENT_MAIL_COMMAND=/absolute/path/to/agent-mail-mcp npm run test:real-mcp:agent-mail-ui
```

For the fixture browser regression, use a Python environment with Selenium,
Firefox and geckodriver, and supply reviewed React/ReactDOM UMD assets:

```bash
DSH_BROWSER_REACT_UMD=/absolute/path/to/react.production.min.js \
DSH_BROWSER_REACT_DOM_UMD=/absolute/path/to/react-dom.production.min.js \
python3 tests/dsh-agent-mail-ui-browser.acceptance.py --json
```

That script loads the generated client bundle in a small test host with a
synthetic HTTP backend. It checks the sidebar and standalone surfaces without
writing real mail. Missing prerequisites must fail the explicitly invoked
gate rather than silently count as a passing browser test.

The real MCP test creates and removes its own mailbox and closes its two
provider sessions. It exercises the UI API dispatcher with real provider
results and DSH-style tool error propagation. It is not an HTTP-server or
full DSH browser acceptance test.

## Earlier artifact evidence

The original 0.1.2 compatibility record identifies SHA-256
`1f191f2d034389638f9d349ccc33aee50f49cfda3aa038acb84febc93970ee5b`.
The later local 0.1.2 archive had SHA-256
`16531d5261a4a955033aba497a124fe714fe8a16da0c8a088fcfea23b1798c91`;
its eight packaged files matched source at `27a5a2e` before this work.
Neither digest should be reused for 0.1.3.

The running 0.1.2 status endpoint reported `live: true`, `missing: []`,
`proxy: existing-mcp-child` and `autoWake: false`. No current candidate was
installed into that live profile during this work.

## Release boundary

Push, tag, GitHub Release, npm publication, marketplace submission and live
upgrade remain separate steps. Browser fixture results establish only the
fixture scenarios; the real standalone result above is recorded separately.
