# Agent Mail UI 0.1.4 acceptance

Date: 2026-09-05. Candidate: `@dff652/dsh-agent-mail-ui@0.1.4`.

## Scope and target

This candidate addresses three P2 findings from the complete unpushed review:
selected-session Quote, actual DSH tool-result cards, and acknowledged mail
incorrectly counted as unread. It retains the earlier Done/Ack interaction
fixes. The client explicitly injects the core `sessions` service, independently
of Agent Mail MCP availability.

The selected acceptance target is DSH/MCP client `0.1.1-rc.2`, companion
bundle `0.1.1`, UI `0.1.4`, and optional better-sidebar `0.12.2`. The existing
live DSH/MCP `0.1.0-rc.6` with UI `0.1.2` remains the rollback baseline;
rc.2 acceptance does not qualify that mixed rc.6 installation. A future core
migration must retain both runtime and profile rollback evidence.

## Final artifact and portable gates

The exact eight-file `dff652-dsh-agent-mail-ui-0.1.4.tgz` has SHA-256:

```text
ed87f8fca7db9a153e0105a4c89c2b8dca2c108456c85bfb81024c85735fe1e9
```

The decompressed tar SHA-256 is
`78e7c8f77fdb9653e80feda62b34711081a4137758c2e54a9b171cacf189b750`.
Each packed file matched current source; the clean-profile gate independently
packed the same digest. The portable suite passed **98/98** on both Node
`22.19.0` and `24.19.0`, including 21 UI tests. Generated-client and public
repository checks passed.

Activation and clean-profile gates passed on Node `24.19.0`, pnpm `11.7.0`,
and reviewed DSH `0.1.1-rc.2` tarball SHA-256
`47ec05f45ada5ab87779ae18a90456b5ebff5421dc0ff5c179677d65e1c16057`.
The clean-profile gate installed once in each Web/headless profile, then
removed the UI without requiring MCP configuration or starting a provider.

Real MCP dispatcher acceptance passed claim renewal, premature Ack rejection,
Done followed by Ack, alpha.4 tail shape, claim failures, and acknowledged
all-mail rows retaining `delivery_status: acked` with `unread: false`. It used
the reviewed alpha.4 provider and matching Node `20.19.2` native-addon runtime
in a disposable mailbox; the harness used Node `24.19.0`.

## Browser evidence

| Browser / host | Result and scope |
|---|---|
| Firefox `155.0`, geckodriver `0.37.1`, fixture | PASS: sidebar Done/Ack and all-mail unread badge, standalone navigation to session 2 then Quote, failed claim, and real-contract `owner.block` running/success/error cards. |
| Chrome for Testing / ChromeDriver `152.0.7977.82`, fixture | PASS: the same regression scenarios. |
| Chrome `152.0.7977.82`, real DSH standalone | PASS: Mail appears before any session; with drawer open, switch between two real sessions and Quote writes only to the selected session. Premature Ack rejection, Done without New, duplicate Done disabled, reload then Check & Ack, and acknowledged task retained in all-mail view passed. |
| Firefox `155.0`, real DSH standalone | PASS: claim, premature Ack rejection, Done without New, duplicate Done disabled, reload then Check & Ack, and empty unread inbox. |
| Chrome `152.0.7977.82`, real better-sidebar `0.12.2` | PASS: New tab → Agent Mail, no duplicate drawer, per-session tabs, Quote into selected session, Done/Ack after reload, acknowledged all-mail row with an empty unread badge. |

Real browser runs install the exact archive above with the companion bundle
into disposable DSH Web profiles. Quote acceptance captures the plugin's
actual runtime context and uses DSH session services to create/select two
blank sessions, then clicks the real Quote button and checks their composer
drafts. It does not substitute a fake sessions service. No model key or model
turn is used. Tool-card lifecycle checks use DSH-shaped synthetic owners;
model-driven tool dispatch is not claimed.

The real sidebar was packed from the previously installed `0.12.2` files
into a disposable profile (SHA-256
`fa24470fad91ca2c087a8b388c6542108a60410ce5b459471a0fbc0b384df1de`).
Its `node-pty` build was allowed only in that temporary profile. No terminal
interaction or fresh marketplace download is claimed. DSH and the MCP client
resolved to `0.1.1-rc.2`; the installed companion/UI/sidebar manifests were
`0.1.1` / `0.1.4` / `0.12.2`.

The expected HTTP 400 during premature Check & Ack is the provider rejection
asserted by the test, not a successful acknowledgement.

## Reproduce

```bash
npm test
npm run check:repo
npm run test:activation:agent-mail-ui
npm run test:clean-profile:agent-mail-ui
DSH_AGENT_MAIL_COMMAND=/absolute/path/to/agent-mail-mcp npm run test:real-mcp:agent-mail-ui
```

For the committed fixture runner, supply separately reviewed React/ReactDOM
UMD assets and Selenium/browser drivers. Run both browsers:

```bash
DSH_BROWSER_REACT_UMD=/absolute/path/to/react.production.min.js \
DSH_BROWSER_REACT_DOM_UMD=/absolute/path/to/react-dom.production.min.js \
python3 tests/dsh-agent-mail-ui-browser.acceptance.py --browser firefox --json

DSH_BROWSER_REACT_UMD=/absolute/path/to/react.production.min.js \
DSH_BROWSER_REACT_DOM_UMD=/absolute/path/to/react-dom.production.min.js \
DSH_BROWSER_CHROME=/absolute/path/to/chrome \
DSH_BROWSER_CHROMEDRIVER=/absolute/path/to/chromedriver \
python3 tests/dsh-agent-mail-ui-browser.acceptance.py --browser chrome --json
```

Fixture tests load the generated bundle and synthetic HTTP backend; the real
DSH results above are separately recorded operator-run integration checks.
Missing browser prerequisites fail the explicitly invoked fixture gate.

## Superseded bytes and boundaries

An intermediate 0.1.4 archive (`1fefb5da…d1baaf`) passed portable/fixture
checks but failed real standalone startup because `sessions` was not injected.
It was rejected and replaced by the final digest above. Historical 0.1.3
bytes retain their [own scoped record](agent-mail-ui-acceptance.md).

Both real browser instances, sender sessions and disposable mailboxes/profiles
were stopped and removed after acceptance. Six recorded live config/artifact
digests remained unchanged, and the live status endpoint still reported
`live: true`, no missing tools and existing-child reuse.

All write-producing checks use disposable mailboxes and profiles. Push,
remote CI, tag, GitHub Release, npm, marketplace submission and live upgrade
remain separate stages in the [release plan](agent-mail-ui-release-plan.md).
