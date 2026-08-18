# Contributing

Contributions should improve a public DeepSeek Harness bundle or its
reproducible acceptance evidence. Provider business logic belongs in the
provider project.

## Before opening a change

- Read `AGENTS.md` and the package README.
- Keep changes inside the owned package and its package-specific tests when
  possible.
- Do not include absolute local paths, LAN topology, credentials, logs,
  messages, provider homes or generated tarballs.
- Use an exact released DSH/MCP-client version. Official `@deepseek-ai/*`
  modules belong in `peerDependencies`.
- Keep `package.json.dsh.bundle.patch`, `cordis.patch.yml`, package tests and
  the packed-file allowlist consistent.

## Local checks

Use the reviewed Node runtime for the DSH release family, then run:

```bash
npm run check:repo
npm test
npm pack --workspace @dff652/dsh-ai-asset-hub --dry-run --ignore-scripts
npm pack --workspace @dff652/dsh-agent-mail --dry-run --ignore-scripts
```

Provider E2E checks require a separately reviewed executable and disposable
testdata. Never point them at a personal provider home or a live DSH profile.

## Pull requests and releases

Explain the behavior change, package version, exact dependency pins, tests,
artifact file list and remaining limitations. Do not claim unpublished package
support, automatic wake, session injection, model-visible L5 support or an
official security review unless the corresponding evidence is included.

The repository owner separately controls merge, push, tag, GitHub Release,
npm publication, marketplace submission, visibility and deployment. Do not
perform those operations from a contribution branch.
