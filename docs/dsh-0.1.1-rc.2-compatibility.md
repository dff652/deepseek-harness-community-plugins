# DSH 0.1.1-rc.2 compatibility evidence

Date: 2026-09-04

This note records the disposable install/config/remove check for the new HEAD
bundle candidates. It does not change or replace the evidence for the already
published AIAH `0.1.1` and Agent Mail `0.1.0` rc.6-compatible release bytes.

The UI 0.1.2 row below is historical evidence for that exact pack, not the
later live 0.1.2 pack or the current 0.1.4 candidate. See the
[current UI acceptance record](agent-mail-ui-0.1.4-acceptance.md).

## Fixed test inputs

| Item | Value |
|---|---|
| Node.js | `v24.19.0` |
| pnpm | `11.7.0` |
| DSH package | `@deepseek-ai/dsh@0.1.1-rc.2` |
| DSH test tarball SHA-256 | `47ec05f45ada5ab87779ae18a90456b5ebff5421dc0ff5c179677d65e1c16057` |
| Profile | Test-owned disposable `headless` profile |

The DSH executable was resolved from the exact tarball with `pnpm dlx`; each
run used a test-owned temporary `DSH_HOME`. No live home or persistent profile
was used.

## Candidate results

For each row, the test ran the equivalent of:

```bash
dsh plugin --profile headless add -w ./<candidate>.tgz
dsh --profile headless --dump-config
dsh plugin --profile headless remove <package>
dsh --profile headless --dump-config
```

The first config dump contained the expected plugin row exactly once; the final
dump no longer contained that row.

| Candidate | Candidate tarball SHA-256 | Result |
|---|---|---|
| `@dff652/dsh-ai-asset-hub@0.1.2` | `a36803b0863e03fbfc1b6c80e5c1300e467a3f2b924437d846c3d20c53b9e097` | add/config/remove PASS |
| `@dff652/dsh-agent-mail@0.1.1` | `03664058d3a7c56d9a151f3a57091d06102d564f66b8cb2efe5f432fa5c18e0d` | add/config/remove PASS |
| `@dff652/dsh-agentmemory@0.1.1` | `c3e20073df2e264f91f27ab63ce0483d3dd5f60c110b39c890a1fc0b4e52644c` | add/config/remove PASS |
| `@dff652/dsh-agent-mail-ui@0.1.2` | `1f191f2d034389638f9d349ccc33aee50f49cfda3aa038acb84febc93970ee5b` | add/config/remove PASS (web and headless; row `id: dsh-agent-mail-ui`) |

The Agent Mail UI check used the same disposable-home pattern. The first
config dump contained `id: dsh-agent-mail-ui` exactly once and did not start
an MCP child; the final dump no longer contained that row.

The check did not start any provider process, write provider data, modify a
live DSH profile, publish a package, create a Release or deploy anything.
