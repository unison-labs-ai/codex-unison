---
name: unison-forget
description: Remove outdated or incorrect information from memory. Use when user says something is no longer true, wants to delete a memory, or information has changed.
allowed-tools: Bash(node:*)
---

# Unison Forget

Remove outdated or incorrect information from the Unison brain.

## When to Use

- User says something is no longer true or has changed
- User explicitly asks to forget or delete a memory
- Information has become outdated or incorrect

## How to Forget

Describe the content to forget — the system will find and remove matching memories:

```bash
node ~/.codex/unison/forget-memory.js "DESCRIPTION_OF_WHAT_TO_FORGET"
```

To forget from a specific custom tag:

```bash
node ~/.codex/unison/forget-memory.js --tag <tag> "DESCRIPTION_OF_WHAT_TO_FORGET"
```

## After Forgetting

Confirm to the user that the memory has been removed. If they mentioned new information to replace it, use the unison-save skill to save the updated information.
