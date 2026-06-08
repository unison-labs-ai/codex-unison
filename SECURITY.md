# Security Policy

## Reporting a vulnerability

Please report security issues privately — **do not open a public GitHub issue.**

Email **security@unisonlabs.ai** with:

- a description of the issue and its impact,
- steps to reproduce (a proof-of-concept if you have one),
- any suggested remediation.

We aim to acknowledge within 3 business days and to keep you updated as we
investigate. We'll credit reporters who want it once a fix ships.

## Scope

This repository is the **open-source Codex CLI integration** for the Unison brain.
It holds no secrets and is not a security boundary — all authentication,
authorization, tenant isolation, and rate limiting are enforced **server-side** by
the Unison brain API. Reports about the client are most useful when they concern:

- credential handling on disk (`~/.codex/unison/credentials.json`),
- the browser OAuth / headless provision flow as implemented client-side,
- dependency or supply-chain risks.

Server-side or account issues should also go to the same address.

## Handling of credentials

The client reads the bearer token (`usk_...`) from the `UNISON_TOKEN` environment
variable or from `~/.codex/unison/credentials.json` (written with `0600` permissions
by the browser auth flow). The token is never logged or transmitted anywhere except
the configured `UNISON_API_URL` host.
