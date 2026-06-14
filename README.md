<div align="center">

<img src="https://raw.githubusercontent.com/unison-labs-ai/unison-brain/main/assets/brain.svg" width="140" alt="Unison Brain" />

# codex-unison

**Codex starts every session from zero. Stop re-explaining your codebase.**

Persistent memory for [OpenAI Codex CLI](https://github.com/openai/codex) — powered by the [Unison brain](https://unisonlabs.ai).

[![CI](https://github.com/unison-labs-ai/codex-unison/actions/workflows/ci.yml/badge.svg)](https://github.com/unison-labs-ai/codex-unison/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/unison-labs-ai/codex-unison?style=social)](https://github.com/unison-labs-ai/codex-unison)

[**Why**](#with-unison-vs-without) • [**Quickstart**](#quick-start) • [**How it works**](#how-it-works) • [**Configuration**](#configuration) • [**Skills**](#skills-fallback-commands) • [**Auth**](#authentication)

</div>

---

Codex forgets everything the moment you close the terminal. `codex-unison` wires the [Unison brain](https://unisonlabs.ai) into Codex CLI's hooks system so your coding agent remembers your stack, preferences, prior decisions, and the lessons learned across every project — automatically, without changing how you work.

### With Unison vs. without

| Without Unison | With Unison |
|---|---|
| Every session starts blank — you re-explain your stack, your preferences, your decisions | Codex opens with full context: architecture choices, code style, what you tried last time |
| Lessons learned in one repo vanish when you switch repos | Memories are scoped per-project _and_ per-user — they travel with you, not the terminal |
| You catch yourself repeating "we use Bun, not npm" for the fifth time | Captured automatically — every N turns and at session end, zero extra keystrokes |
| Secrets or sensitive content accidentally end up in context | `<private>...</private>` wrapping redacts before anything leaves your machine |

---

**Powered by the [Unison brain](https://github.com/unison-labs-ai/unison-brain#the-hard-part--what-every-memory-system-gets-wrong) — not a flat vector store.** Temporal facts that know *what changed when*, entity resolution that knows *who's who*, and one source of truth shared across every agent and teammate — Claude Code, Cursor, Codex, voice, your backend.

### Why Unison, not Codex's built-in memory (or mem0)?

| Other memory | Unison |
|---|---|
| Stores *what you said* as a flat log / vector dump | Resolves *who and what you meant* and *when it changed* — a temporal knowledge graph |
| A silo — scoped to Codex, this repo, this machine, you | One brain every agent **and teammate** reads from and writes back to |
| Keeps returning a now-stale fact with confidence after things change | Bitemporal supersession stops surfacing the version that's no longer true |
| "Trust our benchmark" | An [open, reproducible benchmark](https://github.com/unison-labs-ai/Unison-evals) scoring every system — including ours |

---

## Quick start

1. **Install the hooks:**

   ```bash
   npx codex-unison install
   ```

2. **Start Codex CLI.** On your first prompt, a browser window will open to
   authenticate with Unison automatically.

   Alternatively, authenticate manually:
   - Use `/unison-login` inside Codex
   - Or set `export UNISON_TOKEN="usk_live_..."` in your shell profile

3. **That's it — memory is active.**

---

## How it works

Codex CLI supports a hooks system that lets external scripts run at specific
lifecycle events. `codex-unison` registers three hooks:

| Hook | Event | What it does |
|---|---|---|
| `session-start` | `SessionStart` | Loads the user's memory profile at the start of every session. |
| `recall` | `UserPromptSubmit` | Captures new turns (every N prompts), then searches the Unison brain for relevant memories, injecting them into the prompt as `additionalContext`. |
| `flush` | `Stop` | Captures any remaining turns at session end so the final conversation turns are never lost. |

**Incremental capture**: Memories are saved every N turns (default: 3) during the
session. Memories from earlier in your session are immediately available for recall
in the same session.

The installer:

- Enables the `codex_hooks` feature flag in `~/.codex/config.toml`
- Registers the hooks in `~/.codex/hooks.json`
- Copies pre-bundled hook scripts to `~/.codex/unison/`
- Installs skills to `~/.codex/skills/`

The hooks are tolerant: if the Unison brain is unreachable, the token is missing, or
anything else fails, they exit cleanly without breaking your Codex session.

---

## Commands

```bash
npx codex-unison install     # set up hooks + config + skills
npx codex-unison uninstall   # remove hooks + config (keeps your memories in Unison)
npx codex-unison status      # show current install status
```

---

## Configuration

### Environment variables

| Variable | Purpose |
|---|---|
| `UNISON_TOKEN` | Your Unison API token (`usk_live_...`). Env var takes precedence over credentials file. |
| `UNISON_API_URL` | Override the Unison API base URL (default: `https://brain.unisonlabs.ai`). |
| `UNISON_APP_URL` | Override the Unison app URL for browser auth (default: `https://app.unisonlabs.ai`). |
| `UNISON_DEBUG` | Set to any truthy value to enable debug logging to `~/.codex-unison.log`. |

### `~/.codex/unison.json` (optional)

Drop this file to override defaults:

| Key | Type | Default | Description |
|---|---|---|---|
| `token` | `string` | — | API token (env var takes precedence, browser auth is preferred). |
| `similarityThreshold` | `number` | `0.6` | Minimum similarity score for retrieved memories. |
| `maxMemories` | `number` | `5` | Max memories injected per prompt. |
| `maxProfileItems` | `number` | `5` | Max profile items considered. |
| `injectProfile` | `boolean` | `true` | Whether to fetch and inject the user profile. |
| `userTagPrefix` | `string` | auto | Override the user memory tag. |
| `projectTagPrefix` | `string` | auto (per-repo) | Override the project memory tag. |
| `debug` | `boolean` | `false` | Enable debug logging. |
| `captureEveryNTurns` | `number` | `3` | Save memories every N turns (0 = session-end only). |
| `signalExtraction` | `boolean` | `false` | Enable signal-based filtering (only capture turns with keywords like "prefer", "decided"). |
| `signalKeywords` | `string[]` | (defaults) | Keywords that trigger signal extraction. |
| `signalTurnsBefore` | `number` | `3` | Include N turns before a signal for context. |
| `enableCustomTags` | `boolean` | `false` | Enable AI-driven routing to custom tags. |
| `customTags` | `array` | `[]` | Custom tags with `tag` and `description` (see below). |
| `customTagInstructions` | `string` | `""` | Free-text instructions for the AI on how to route memories to tags. |

User tags are auto-derived from your `git config user.email`. Project tags are
derived from the Git common directory when available, so linked worktrees share one
project tag by default. Set `UNISON_ISOLATE_WORKTREES=true` to keep each worktree isolated.

---

## Skills (fallback commands)

These Codex skills are available as explicit commands when you need more control.
All memory skills support `--tag <tag>` to target a specific custom tag.

| Skill | Usage | Description |
|---|---|---|
| `/unison-search` | `/unison-search [--tag <tag>] <query>` | Search memories manually. |
| `/unison-save` | `/unison-save [--tag <tag>] <content>` | Save a specific memory explicitly. |
| `/unison-forget` | `/unison-forget [--tag <tag>] <content>` | Remove a memory. |
| `/unison-profile` | `/unison-profile` | Show remembered profile facts. |
| `/unison-status` | `/unison-status` | Show connection and account status. |
| `/unison-login` | `/unison-login` | Re-authenticate with Unison. |
| `/unison-logout` | `/unison-logout` | Remove saved local credentials. |

---

## Custom tags

Custom tags let you organize memories into separate buckets (e.g., `work`,
`personal`, `code_style`). The AI reads the tag descriptions from your config
and automatically picks the right tag when saving memories.

Add these fields to `~/.codex/unison.json`:

```json
{
  "enableCustomTags": true,
  "customTags": [
    { "tag": "personal", "description": "Personal life — family, health, hobbies, routines" },
    { "tag": "work", "description": "Work-related — projects, deadlines, meetings, colleagues" },
    { "tag": "code_style", "description": "Coding preferences — languages, tools, patterns, conventions" }
  ],
  "customTagInstructions": "Route coding preferences to code_style. Personal topics to personal. Default to project tag for ambiguous content."
}
```

---

## Authentication

### Browser flow (recommended)

Run `npx codex-unison install` and start Codex. A browser window opens automatically.

### Headless / machine auth

If you can't use a browser (CI, remote server), use the three-step machine-auth flow:

```bash
# 1. Provision an account (sends OTP to your email)
curl -X POST https://brain.unisonlabs.ai/v1/auth/provision \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
# Returns: {"apiKey":"usk_live_...","workspaceId":"...","status":"unverified","emailSent":true}

# 2. Verify with the OTP from your email
curl -X POST https://brain.unisonlabs.ai/v1/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}'
# Returns: {"verified":true,"workspaceId":"..."}

# 3. Set the token
export UNISON_TOKEN="usk_live_..."
```

For existing verified accounts, use `/v1/auth/request-key` to recover your key.

---

## Privacy

Anything wrapped in `<private>...</private>` is replaced with `[REDACTED]` before
being sent to Unison. Use this for secrets, tokens, or anything you'd rather
not have stored.

---

## Star history

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=unison-labs-ai/codex-unison&type=Date)](https://star-history.com/#unison-labs-ai/codex-unison&Date)

If this saves you a re-explanation, consider leaving a star.

</div>

---

## Part of the Unison Labs constellation

**One brain, every agent.** Every repo below reads from _and writes to_ the same [Unison brain](https://unisonlabs.ai) — no per-tool memory silos.

| Repo | What it does |
|---|---|
| [unison-brain](https://github.com/unison-labs-ai/unison-brain) | CLI · SDK · MCP server — the core |
| [claude-unison](https://github.com/unison-labs-ai/claude-unison) | Memory for Claude Code |
| [cursor-unison](https://github.com/unison-labs-ai/cursor-unison) | Memory for Cursor |
| **[codex-unison](https://github.com/unison-labs-ai/codex-unison)** | **Memory for OpenAI Codex CLI ← you are here** |
| [opencode-unison](https://github.com/unison-labs-ai/opencode-unison) | Memory for OpenCode |
| [openclaw-unison](https://github.com/unison-labs-ai/openclaw-unison) | Memory for OpenClaw |
| [pipecat-unison](https://github.com/unison-labs-ai/pipecat-unison) | Memory for Pipecat voice agents |
| [python-sdk](https://github.com/unison-labs-ai/python-sdk) | Python SDK for the brain |
| [install-mcp](https://github.com/unison-labs-ai/install-mcp) | One-command MCP installer |
| [code-chunk](https://github.com/unison-labs-ai/code-chunk) | AST-aware code chunking |
| [unison-fs](https://github.com/unison-labs-ai/unison-fs) | Mount the brain as a filesystem |
| [backchannel](https://github.com/unison-labs-ai/backchannel) | Async messaging between agents |
| [Unison-evals](https://github.com/unison-labs-ai/Unison-evals) | Open memory benchmark suite |

---

## License

MIT
