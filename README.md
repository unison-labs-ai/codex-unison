# codex-unison

> Persistent memory for OpenAI Codex CLI — powered by [Unison](https://unisonlabs.ai)

Codex forgets every session. `codex-unison` wires the Unison brain into Codex CLI's
hooks system so your coding agent remembers your stack, preferences, prior decisions,
and the lessons learned across every project — automatically.

## Features

- **Automatic recall** — relevant memories are injected into every prompt via the
  `UserPromptSubmit` hook.
- **Automatic capture** — conversations are stored incrementally (every N turns) and
  at session end via the `Stop` hook.
- **Project + user scoping** — memories are tagged per-project and per-user so
  context never leaks across repos.
- **Custom tag routing** — define custom memory tags (e.g., `work`, `personal`,
  `code_style`). The AI automatically picks the right tag based on your instructions
  when saving, searching, or forgetting memories.
- **Privacy-aware** — anything wrapped in `<private>...</private>` is redacted
  before being sent to Unison.
- **Zero-config install** — one command sets up `~/.codex/config.toml` and
  `~/.codex/hooks.json` for you.
- **No runtime deps in hooks** — the hook scripts are pre-bundled with esbuild for
  fast cold starts.
- **Fallback skills** — explicit `/unison-search`, `/unison-save`, `/unison-forget`,
  `/unison-profile`, `/unison-status`, `/unison-login`, and `/unison-logout` commands
  available when hooks don't cover your use case.

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

## How it works

Codex CLI supports a hooks system that lets external scripts run at specific
lifecycle events. `codex-unison` registers three hooks:

| Hook              | Event                  | What it does                                                        |
| ----------------- | ---------------------- | ------------------------------------------------------------------- |
| `session-start`   | `SessionStart`         | Loads the user's memory profile at the start of every session.      |
| `recall`          | `UserPromptSubmit`     | Captures new turns (every N prompts), then searches the Unison brain for relevant memories, injecting them into the prompt as `additionalContext`. |
| `flush`           | `Stop`                 | Captures any remaining turns at session end so the final conversation turns are never lost. |

**Incremental capture**: Memories are saved every N turns (default: 3) during the
session. This means memories from earlier in your session are immediately available
for recall in the same session.

The installer:

- Enables the `codex_hooks` feature flag in `~/.codex/config.toml`
- Registers the hooks in `~/.codex/hooks.json`
- Copies pre-bundled hook scripts to `~/.codex/unison/`
- Installs skills to `~/.codex/skills/`

The hooks are tolerant: if the Unison brain is unreachable, the token is missing, or
anything else fails, they exit cleanly without breaking your Codex session.

## Configuration

### Environment variables

| Variable          | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `UNISON_TOKEN`    | Your Unison API token (`usk_live_...`). Env var takes precedence over credentials file. |
| `UNISON_API_URL`  | Override the Unison API base URL (default: `https://api.unisonlabs.ai`). |
| `UNISON_APP_URL`  | Override the Unison app URL for browser auth (default: `https://app.unisonlabs.ai`). |
| `UNISON_DEBUG`    | Set to any truthy value to enable debug logging to `~/.codex-unison.log`. |

### `~/.codex/unison.json` (optional)

Drop this file to override defaults:

| Key                      | Type       | Default        | Description                                                                                  |
| ------------------------ | ---------- | -------------- | -------------------------------------------------------------------------------------------- |
| `token`                  | `string`   | —              | API token (env var takes precedence, browser auth is preferred).                              |
| `similarityThreshold`    | `number`   | `0.6`          | Minimum similarity score for retrieved memories.                                             |
| `maxMemories`            | `number`   | `5`            | Max memories injected per prompt.                                                            |
| `maxProfileItems`        | `number`   | `5`            | Max profile items considered.                                                                |
| `injectProfile`          | `boolean`  | `true`         | Whether to fetch and inject the user profile.                                                |
| `userTagPrefix`          | `string`   | auto           | Override the user memory tag.                                                                |
| `projectTagPrefix`       | `string`   | auto (per-repo) | Override the project memory tag.                                                            |
| `debug`                  | `boolean`  | `false`        | Enable debug logging.                                                                        |
| `captureEveryNTurns`     | `number`   | `3`            | Save memories every N turns (0 = session-end only).                                          |
| `signalExtraction`       | `boolean`  | `false`        | Enable signal-based filtering (only capture turns with keywords like "prefer", "decided").   |
| `signalKeywords`         | `string[]` | (defaults)     | Keywords that trigger signal extraction.                                                     |
| `signalTurnsBefore`      | `number`   | `3`            | Include N turns before a signal for context.                                                 |
| `enableCustomTags`       | `boolean`  | `false`        | Enable AI-driven routing to custom tags.                                                     |
| `customTags`             | `array`    | `[]`           | Custom tags with `tag` and `description` (see below).                                        |
| `customTagInstructions`  | `string`   | `""`           | Free-text instructions for the AI on how to route memories to tags.                          |

User tags are auto-derived from your `git config user.email`. Project tags are
derived from the Git common directory when available, so linked worktrees share one
project tag by default. Set `UNISON_ISOLATE_WORKTREES=true` to keep each worktree isolated.

## Commands

```bash
npx codex-unison install     # set up hooks + config + skills
npx codex-unison uninstall   # remove hooks + config (keeps your memories in Unison)
npx codex-unison status      # show current install status
```

## Skills (fallback commands)

These Codex skills are available as explicit commands when you need more control.
All memory skills support `--tag <tag>` to target a specific custom tag.

| Skill             | Usage                                                  | Description                              |
| ----------------- | ------------------------------------------------------ | ---------------------------------------- |
| `/unison-search`  | `/unison-search [--tag <tag>] <query>`                 | Search memories manually.                |
| `/unison-save`    | `/unison-save [--tag <tag>] <content>`                 | Save a specific memory explicitly.       |
| `/unison-forget`  | `/unison-forget [--tag <tag>] <content>`               | Remove a memory.                         |
| `/unison-profile` | `/unison-profile`                                      | Show remembered profile facts.           |
| `/unison-status`  | `/unison-status`                                       | Show connection and account status.      |
| `/unison-login`   | `/unison-login`                                        | Re-authenticate with Unison.             |
| `/unison-logout`  | `/unison-logout`                                       | Remove saved local credentials.          |

## Custom Tags

Custom tags let you organize memories into separate buckets (e.g., `work`,
`personal`, `code_style`). The AI reads the tag descriptions from your config
and automatically picks the right tag when saving memories.

### Setup

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

## Authentication

### Browser flow (recommended)

Run `npx codex-unison install` and start Codex. A browser window opens automatically.

### Headless / machine auth

If you can't use a browser (CI, remote server), use the three-step machine-auth flow:

```bash
# 1. Provision an account (sends OTP to your email)
curl -X POST https://api.unisonlabs.ai/v1/auth/provision \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
# Returns: {"apiKey":"usk_live_...","tenantId":"...","status":"unverified","emailSent":true}

# 2. Verify with the OTP from your email
curl -X POST https://api.unisonlabs.ai/v1/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}'
# Returns: {"verified":true,"tenantId":"..."}

# 3. Set the token
export UNISON_TOKEN="usk_live_..."
```

For existing verified accounts, use `/v1/auth/request-key` to recover your key.

## Privacy

Anything wrapped in `<private>...</private>` is replaced with `[REDACTED]` before
being sent to Unison. Use this for secrets, tokens, or anything you'd rather
not have stored.

## How the brain API works

All memory operations hit the Unison brain REST API at `${UNISON_API_URL}/v1/brain/*`.
The token is sent as `Authorization: Bearer usk_live_...` on every request.

Documents are stored under `/private/sessions/<session-id>.md` per session and
tagged with the user's derived tag (sha256 of git email) and the project's tag
(sha256 of git root path). Search uses the brain's hybrid keyword + semantic index.

## License

MIT
