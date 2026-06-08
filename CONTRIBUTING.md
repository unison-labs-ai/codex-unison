# Contributing to codex-unison

Thanks for helping improve the Codex CLI memory integration for Unison.

## Repo layout

A single-package TypeScript project built with esbuild:

- `src/cli.ts` — the `codex-unison` CLI (install / uninstall / status)
- `src/services/` — core services: brain client, auth, tags, session, privacy, …
- `src/hooks/` — Codex lifecycle hooks: `recall.ts`, `flush.ts`, `session-start.ts`
- `src/skills/` — Codex skill scripts + SKILL.md files
- `src/config.ts` — config loading and defaults
- `test/unit.mjs` — unit tests (Node built-in test runner)
- `build.mjs` — esbuild bundler script

## Development

```bash
bun install
bun run build     # compile to dist/
bun run test      # run all unit tests
bun run lint      # TypeScript type-check (alias for typecheck)
```

## Before opening a PR

1. `bun run build` and `bun run test` must both pass.
2. Keep changes scoped — one logical change per PR.
3. Add or update a test for every new behavior.
4. Do not commit `.env` or any real credentials.

## Conventions

- TypeScript, ESM source, CommonJS output (esbuild bundles to CJS for Node compat).
- No additional runtime dependencies — keep the install footprint minimal.
- Human-readable CLI output goes to **stderr**; machine data (hook envelopes) goes to **stdout** so piping stays clean.
- The client enforces nothing — the Unison backend is the only security boundary. Do not add client-side scope or path checks.
- Hook scripts must be tolerant: if the brain is unreachable or the token is missing, exit cleanly (code 0) without breaking the Codex session.

## Reporting bugs / proposing features

Use the issue templates. For security issues, see [`SECURITY.md`](./SECURITY.md) — do **not** open a public issue.
