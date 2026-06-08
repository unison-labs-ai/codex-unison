---
name: unison-logout
description: Log out of Unison brain in Codex. Use when the user wants to disconnect Unison, remove saved credentials, switch accounts, clear auth state, or stop memory from using the current saved token.
allowed-tools: Bash(node:*)
---

# Unison Logout

Remove saved Unison credentials for Codex:

```bash
node ~/.codex/unison/logout.js
```

Logout creates an intentional disconnected marker so the automatic recall hook will not reopen browser auth on the next prompt. `/unison-status` should report disconnected after logout. `/unison-login` clears the marker and reconnects.

On Windows, if running the command from Codex, request escalated shell execution immediately instead of trying the sandbox first. Use a narrow approval reason such as:

> Run Unison logout from the Codex home directory so it can remove saved credentials.

If `UNISON_TOKEN` is set in the parent shell, the script cannot unset it. Tell the user to unset that environment variable or restart Codex if the script reports it is still active.

Never print the full token.
