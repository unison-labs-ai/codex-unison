---
name: unison-status
description: Show Unison brain connection status for Codex. Use when the user asks whether Unison is connected, which account or token is active, memory hook health, or plugin status.
allowed-tools: Bash(node:*)
---

# Unison Status

Show whether Unison is connected and which credential source is active:

```bash
node ~/.codex/unison/status.js
```

## Windows Sandbox

On Windows, if running the command from Codex, request escalated shell execution immediately instead of trying the sandbox first. Use a narrow approval reason such as:

> Run Unison status from the Codex home directory so it can read the installed credentials.

Use this when the user asks whether memory is active, what Unison account is connected, or whether Codex can currently use Unison.

Never print the full token. The script masks credentials; preserve that masking in the response.
