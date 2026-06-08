/**
 * Shared capture logic used by both recall and flush hooks.
 * Reads transcript entries since last capture, filters by signals,
 * and saves to the brain under the user's tag.
 */
import { existsSync } from "node:fs";
import { UnisonBrainClient } from "./client.js";
import { log } from "./logger.js";
import {
  parseTranscript,
  getEntriesSince,
  formatTranscript,
  findTranscriptPath,
} from "./transcript.js";
import { getLastCapturedIndex, setLastCapturedIndex } from "./tracker.js";
import { filterBySignals, groupEntriesIntoTurns } from "./signals.js";

export interface CaptureOptions {
  requireMinEntries?: number;
  requireMinTurns?: number;
}

export function resolveTranscriptPath(
  transcriptPath: string | null | undefined,
  sessionId: string,
): string | null {
  if (transcriptPath) return transcriptPath;
  return findTranscriptPath(sessionId);
}

export async function captureEntries(
  caller: string,
  client: UnisonBrainClient,
  sessionId: string,
  transcriptPath: string | null,
  tags: { project: string; user: string },
  options: CaptureOptions = {},
): Promise<void> {
  const { requireMinEntries = 0, requireMinTurns = 0 } = options;

  if (!transcriptPath || !existsSync(transcriptPath)) {
    log(`${caller}: no transcript to capture from`, { sessionId, transcriptPath });
    return;
  }

  const entries = parseTranscript(transcriptPath);
  if (entries.length === 0) {
    log(`${caller}: transcript empty`, { sessionId });
    return;
  }

  const lastIndex = getLastCapturedIndex(sessionId);
  const newEntries = getEntriesSince(entries, lastIndex);

  if (requireMinEntries > 0 && newEntries.length < requireMinEntries) {
    log(`${caller}: not enough new entries to capture`, {
      sessionId,
      newCount: newEntries.length,
      required: requireMinEntries,
      lastIndex,
    });
    return;
  }

  if (newEntries.length === 0) {
    log(`${caller}: no new entries to capture`, { sessionId });
    return;
  }

  if (requireMinTurns > 0) {
    const turns = groupEntriesIntoTurns(newEntries);
    const effectiveTurnCount = turns.length + 1;
    if (effectiveTurnCount < requireMinTurns) {
      log(`${caller}: waiting for more turns before capture`, {
        sessionId,
        turnCount: effectiveTurnCount,
        requiredTurns: requireMinTurns,
        lastIndex,
      });
      return;
    }
  }

  const signalEntries = filterBySignals(newEntries);

  if (signalEntries.length === 0) {
    log(`${caller}: no signal entries to capture`, {
      sessionId,
      totalNew: newEntries.length,
      lastIndex,
    });
    const lastEntry = newEntries[newEntries.length - 1];
    setLastCapturedIndex(sessionId, lastEntry.index);
    return;
  }

  log(`${caller}: capturing signal entries`, {
    sessionId,
    signalCount: signalEntries.length,
    totalNew: newEntries.length,
    lastIndex,
  });

  const transcript = formatTranscript(signalEntries);
  const rawContent = `[Session ${sessionId}]\n${transcript}`;

  const content = rawContent
    .replace(/\[UNISON CONTEXT\][\s\S]*?\[END UNISON CONTEXT\]\s*/g, "")
    .replace(/<unison-context>[\s\S]*?<\/unison-context>\s*/g, "")
    .trim();

  const metadata = {
    type: "conversation",
    sessionId,
    entryCount: newEntries.length,
    timestamp: new Date().toISOString(),
    captureMode: caller === "flush" ? "session_end" : "turn",
  };

  try {
    await client.addMemory(content, tags.user, metadata, { customId: sessionId });

    const lastEntry = newEntries[newEntries.length - 1];
    setLastCapturedIndex(sessionId, lastEntry.index);

    log(`${caller}: captured entries`, {
      sessionId,
      count: newEntries.length,
      lastIndex: lastEntry.index,
    });
  } catch (error) {
    log(`${caller}: capture error`, { error: String(error) });
  }
}
