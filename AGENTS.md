# AGENTS.md

Guidance for AI agents. This file covers two jobs — jump to yours:

- **Use codex-unison** — you're an agent helping someone wire Unison memory into Codex CLI
- **Contribute to this repo** — you're changing this integration's code

Follows the [AGENTS.md](https://agents.md/) convention. Human contributors: see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Use codex-unison

### What it does

`codex-unison` registers three Codex CLI lifecycle hooks that give Codex persistent
memory backed by the Unison brain:

| Hook | Codex event | What it does |
|---|---|---|
| `session-start` | `SessionStart` | Loads the user's memory profile at the start of every session |
| `recall` | `UserPromptSubmit` | Captures new turns (every N prompts) then searches the brain for relevant memories, injecting them as `additionalContext` |
| `flush` | `Stop` | Saves remaining turns at session end so nothing is lost |

Memory is stored as documents under `/private/notes/session-<id>.md` in the Unison
brain, tagged with the user's tag (sha256 of git email) and the project's tag (sha256
of git root), so context never leaks across repos or users. Brain user scopes are
`/private/` and `/workspace/` (plus read-only `/system/`). Teams live under
`/workspace/teams/<slug>/` inside the workspace scope.

### Install (one command)

```bash
npx codex-unison install
```

This sets up `~/.codex/config.toml`, `~/.codex/hooks.json`, hook scripts, and 7
Codex skills. Run it once; it is idempotent.

### Authenticate

**Browser flow (recommended):** start Codex after installing — a browser window
opens automatically on the first prompt.

**Headless / CI (no browser):**

```bash
# 1. Provision an account
curl -X POST https://brain.unisonlabs.ai/v1/auth/provision \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
# Returns: {"apiKey":"usk_live_...","workspaceId":"..."}

# 2. Set the token
export UNISON_TOKEN="usk_live_..."
```

The token can also go in `~/.codex/unison.json` as `"token": "usk_live_..."` but
the environment variable takes precedence and is preferred for agents.

**Override the API base URL** (e.g. for a self-hosted brain):

```bash
export UNISON_API_URL="http://localhost:4001"
export UNISON_TOKEN="usk_live_..."
```

### Verify

```bash
npx codex-unison status
```

### Skills available inside Codex

| Skill | Description |
|---|---|
| `/unison-search <query>` | Search memories manually |
| `/unison-save <content>` | Save a specific memory explicitly |
| `/unison-forget <content>` | Remove a memory |
| `/unison-profile` | Show remembered profile facts |
| `/unison-status` | Show connection and account status |
| `/unison-login` | Re-authenticate with Unison |
| `/unison-logout` | Remove saved local credentials |

All skills support `--tag <tag>` when custom tags are configured.

### Privacy

Anything wrapped in `<private>...</private>` is replaced with `[REDACTED]` before
being sent to Unison. Use this for secrets, tokens, or anything you'd rather not store.

---

## Contributing to this repo

Single-package TypeScript project, built with esbuild. Source in `src/`, tests in `test/`.

### Build, test, lint

```bash
bun install
bun run build     # compile src/ → dist/ with esbuild
bun run test      # 48 unit tests via node --test
bun run lint      # TypeScript type-check
```

CI runs all three. All must pass before merging.

### Key conventions

- No additional runtime dependencies. Keep the install footprint minimal.
- Hook scripts must be tolerant: if the brain is unreachable or the token is missing,
  exit cleanly (code 0) — never break a Codex session.
- Human-readable output goes to **stderr**; hook envelopes (machine data) go to **stdout**.
- The client enforces nothing. The Unison backend is the only security boundary.
  Do not add client-side scope checks or path allow-lists.

### PRs

One logical change per PR. Add or update a test for every new behavior. Run
`bun run build && bun run test` before pushing. Security issues: see [`SECURITY.md`](./SECURITY.md).
