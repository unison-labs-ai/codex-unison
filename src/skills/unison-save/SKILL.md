---
name: unison-save
description: Save important project knowledge to memory. Use when user wants to preserve architectural decisions, significant bug fixes, design patterns, or important implementation details for future reference.
allowed-tools: Bash(node:*)
---

# Unison Save

Save important project knowledge based on what the user wants to preserve.

## Step 1: Understand User Request

Analyze what the user is asking to save from the conversation.

## Step 2: Format Content

Format the content to capture the key context:

```
[SAVE:<date>]

<User> wanted to <goal/problem>.

The approach taken was <approach/solution>.

Decision: <decision made>.

<key details, files if relevant>

[/SAVE]
```

## Step 3: Save

```bash
node ~/.codex/unison/save-memory.js "FORMATTED_CONTENT"
```

### Tag Routing

If custom tags are configured (see `[UNISON TAGS]` in your context), you can route the memory to a specific tag using `--tag`:

```bash
node ~/.codex/unison/save-memory.js --tag <tag> "FORMATTED_CONTENT"
```

Choose the tag whose description best matches the content being saved. If unsure, omit `--tag` to save to the default project tag.
