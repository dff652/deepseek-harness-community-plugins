# Public DeepSeek Harness Plugins collaboration rules

This repository is a sanitized staging tree for configuration-only DeepSeek
Harness bundle packages. GitHub visibility is a separate owner decision and
is not implied by the repository name. Provider implementations, provider
data models and deployment credentials remain in their own projects.

## Public boundary

- Do not add private deployment paths, usernames, LAN addresses, domains,
  tokens, certificates, provider homes, messages, logs or runtime databases.
- Do not copy provider source code or claim that a bundle is an official
  provider security review.
- Use placeholders such as `/absolute/path/to/aiah` in documentation. A
  deployment supplies machine-specific paths through its profile or protected
  environment.
- Keep future packages in separate directories with independent versions and
  allowlists. Do not create placeholder packages for work that is not ready.

## Bundle and process safety

- Every installable child must declare `dsh.bundle.patch` in `package.json`.
- Official `@deepseek-ai/*` modules are exact `peerDependencies`; do not use
  floating tags or unpinned Git dependencies.
- Launch provider commands with argv and `shell: false`. Never interpolate a
  shell command into a bundle.
- Fail closed on missing executables, invalid configuration and duplicate
  namespaces.
- Keep provider executables, identities, homes, endpoints and credentials
  outside the package.

## Validation and release gates

- Run `npm run check:repo`, package contract tests and
  `npm pack --dry-run --ignore-scripts` before requesting a release.
- Validate the exact packed tarball in a clean disposable DSH profile.
- Record version, digest and acceptance evidence without recording secrets or
  user data.
- Commit, push, tag, GitHub Release, npm publication, repository visibility
  and live deployment are separate owner-authorized operations.
- Do not manufacture commits to satisfy a marketplace age or commit-count
  gate. Each commit must represent a meaningful reviewed change.

## Review ownership

Workers may own disjoint package directories and package-specific tests. The
primary agent reviews the complete diff, reruns tests, inspects packed files and
controls all publication or deployment transitions.
