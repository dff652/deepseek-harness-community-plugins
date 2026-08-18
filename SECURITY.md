# Security policy

This repository contains a thin DSH composition layer. It does not contain
provider credentials, provider data, deployment homes or a network service.

## Supported security scope

Please report vulnerabilities in the bundle itself, including unsafe command
construction, an unintended package file, a missing fail-closed check or a
secret accidentally committed to this repository. Do not include credentials,
private messages or user data in a report.

When this repository is public, use a private GitHub Security Advisory or
contact the repository owner through GitHub. Until then, do not open a public
issue containing sensitive details.

Provider vulnerabilities belong in the provider's own security process. A
market listing is not an endorsement or an official security audit.

## Release response

A report is triaged before any package or repository visibility change. A
release candidate is re-packed and its file allowlist, dependency pins,
process-launch behavior and disposable-profile acceptance are rerun before a
fixed release is authorized.
