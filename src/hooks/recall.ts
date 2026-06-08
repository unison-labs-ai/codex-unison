import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { isConfigured, CONFIG, reloadToken, getTagCatalog } from "../config.js";
import { UnisonBrainClient } from "../services/client.js";
import { getTags } from "../services/tags.js";
import { formatCombinedContext } from "../services/context.js";
import { log } from "../services/logger.js";
import { startAuthFlow, AUTH_BASE_URL } from "../services/auth.js";
import { captureEntries, resolveTranscriptPath } from "../services/capture.js";
import { getSeenFacts, addSeenFacts } from "../services/factCache.js";
import { getSessionId } from "../services/session.js";

const AUTH_ATTEMPTED_FILE = join(homedir(), ".codex", "unison", ".auth-attempted");
const LOGGED_OUT_FILE = join(homedir(), ".codex", "unison", ".logged-out");

interface CodexHookPayload {
  session_id?: string;
  prompt?: string;
  input?: string;
  transcript_path?: string | null;
  cwd?: string;
  [key: string]: unknown;
}

function exitWithContext(additionalContext: string): never {
  if (additionalContext) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext,
        },
      })
    );
  }
  process.exit(0);
}

async function main() {
  let rawInput = "";
  try {
    rawInput = readFileSync(0, "utf-8");
  } catch {
    process.exit(0);
  }

  if (!isConfigured()) {
    if (existsSync(LOGGED_OUT_FILE)) {
      log("recall: logged out marker present, skipping browser auth");
      exitWithContext("");
    }

    const alreadyAttempted = existsSync(AUTH_ATTEMPTED_FILE);

    if (!alreadyAttempted) {
      try {
        mkdirSync(dirname(AUTH_ATTEMPTED_FILE), { recursive: true });
        writeFileSync(AUTH_ATTEMPTED_FILE, new Date().toISOString());
      } catch {}

      try {
        log("recall: no token, starting browser auth flow");
        await startAuthFlow();
        reloadToken();
        try { unlinkSync(AUTH_ATTEMPTED_FILE); } catch {}
        log("recall: auth flow completed");
      } catch (authErr) {
        const isTimeout =
          authErr instanceof Error && authErr.message === "AUTH_TIMEOUT";
        exitWithContext(
          "[UNISON] Memory is installed but NOT active — missing UNISON_TOKEN.\n" +
          (isTimeout
            ? "Authentication timed out. Please complete login in the browser.\n"
            : "Authentication failed.\n") +
          `If the browser did not open, visit: ${AUTH_BASE_URL}\n` +
          "Run /unison-login to try again, or set UNISON_TOKEN manually."
        );
      }
    } else {
      exitWithContext(
        "[UNISON] Memory is installed but NOT active — missing UNISON_TOKEN.\n" +
        "Run /unison-login to authenticate, or set UNISON_TOKEN in your shell profile."
      );
    }
  }

  let payload: CodexHookPayload = {};
  try {
    payload = JSON.parse(rawInput) as CodexHookPayload;
  } catch {
    exitWithContext("");
  }

  const query = payload.prompt || payload.input || "";
  if (!query.trim()) {
    exitWithContext("");
  }

  const cwd = payload.cwd || process.cwd();
  const tags = getTags(cwd);
  const sessionId = getSessionId(payload.session_id, tags.project);

  log("recall: start", {
    query: query.slice(0, 100),
    tags,
    sessionId,
    autoRecallEveryPrompt: CONFIG.autoRecallEveryPrompt,
  });

  const transcriptPath = resolveTranscriptPath(payload.transcript_path, sessionId);
  const client = new UnisonBrainClient();

  if (CONFIG.captureEveryNTurns > 0) {
    await captureEntries("recall", client, sessionId, transcriptPath, tags, {
      requireMinEntries: 2,
      requireMinTurns: CONFIG.captureEveryNTurns,
    });
  }

  if (!CONFIG.autoRecallEveryPrompt) {
    exitWithContext("");
  }

  try {
    const [profileResult, projectSearchResult] = await Promise.all([
      client.getProfileWithSearch(tags.user, query),
      client.searchBrain(query, { limit: CONFIG.maxMemories, tags: [tags.project] }),
    ]);

    const seen = getSeenFacts(sessionId);
    const { text, newFacts } = formatCombinedContext(
      profileResult,
      CONFIG.maxMemories,
      CONFIG.maxProfileItems,
      projectSearchResult,
      seen,
    );

    log("recall: done", {
      contextLength: text.length,
      newFactCount: newFacts.length,
      seenCount: seen.size,
    });

    const tagCatalog = getTagCatalog();

    if (newFacts.length > 0) {
      addSeenFacts(sessionId, newFacts);
      let additionalContext = `[UNISON CONTEXT]\n${text}\n[END UNISON CONTEXT]`;

      if (tagCatalog) {
        additionalContext += `\n\n[UNISON TAGS]\n${tagCatalog}\n[END UNISON TAGS]`;
      }

      log("recall: emit context", { additionalContextLength: additionalContext.length });
      exitWithContext(additionalContext);
    } else if (tagCatalog) {
      const additionalContext = `[UNISON TAGS]\n${tagCatalog}\n[END UNISON TAGS]`;
      log("recall: emit tag catalog only", { additionalContextLength: additionalContext.length });
      exitWithContext(additionalContext);
    } else {
      exitWithContext("");
    }
  } catch (error) {
    log("recall: error", { error: String(error) });
    exitWithContext("");
  }
}

main().catch(() => {
  exitWithContext("");
});
