import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripPrivateContent, cleanContent } from "./privacy.js";

const SESSIONS_DIR = join(homedir(), ".codex", "sessions");

export interface TranscriptEntry {
  index: number;
  role: string;
  content: string;
}

/**
 * Find the transcript file for a given session ID.
 * Codex stores transcripts at ~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{session_id}.jsonl
 */
export function findTranscriptPath(sessionId: string): string | null {
  if (!existsSync(SESSIONS_DIR)) {
    return null;
  }

  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  const todayDir = join(SESSIONS_DIR, year, month, day);
  const found = searchDirForSession(todayDir, sessionId);
  if (found) return found;

  for (let i = 1; i <= 3; i++) {
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - i);
    const y = pastDate.getFullYear().toString();
    const m = (pastDate.getMonth() + 1).toString().padStart(2, "0");
    const d = pastDate.getDate().toString().padStart(2, "0");
    const pastDir = join(SESSIONS_DIR, y, m, d);
    const found = searchDirForSession(pastDir, sessionId);
    if (found) return found;
  }

  return null;
}

function searchDirForSession(dir: string, sessionId: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (file.endsWith(".jsonl") && file.includes(sessionId)) {
        return join(dir, file);
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Parse a Codex JSONL transcript file into TranscriptEntry[].
 */
export function parseTranscript(transcriptPath: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  if (!existsSync(transcriptPath)) {
    return entries;
  }

  try {
    const raw = readFileSync(transcriptPath, "utf-8");
    const lines = raw.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          payload?: {
            type?: string;
            message?: string;
            text?: string;
            role?: string;
            content?: unknown;
          };
        };

        if (parsed.type === "event_msg" && parsed.payload) {
          const payload = parsed.payload;

          if (payload.type === "user_message" && payload.message) {
            const cleaned = cleanContent(stripPrivateContent(payload.message));
            if (cleaned && cleaned.length > 0) {
              entries.push({ index: i, role: "user", content: cleaned });
            }
          }

          if (payload.type === "assistant_output_text" && payload.text) {
            const cleaned = cleanContent(stripPrivateContent(payload.text));
            if (cleaned && cleaned.length > 0) {
              entries.push({ index: i, role: "assistant", content: cleaned });
            }
          }
        }

        if (parsed.type === "response_item" && parsed.payload) {
          const payload = parsed.payload;
          if (payload.role === "assistant" && payload.content) {
            const content = payload.content;
            let text = "";

            if (typeof content === "string") {
              text = content;
            } else if (Array.isArray(content)) {
              for (const block of content as Array<{ type?: string; text?: string }>) {
                if (block.type === "output_text" && block.text) {
                  text += block.text + "\n";
                }
              }
            }

            const cleaned = cleanContent(stripPrivateContent(text));
            if (cleaned && cleaned.length > 0) {
              entries.push({ index: i, role: "assistant", content: cleaned });
            }
          }
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // unreadable transcript
  }

  return entries;
}

export function getEntriesSince(
  entries: TranscriptEntry[],
  lastIndex: number | null,
): TranscriptEntry[] {
  if (lastIndex === null) return entries;
  return entries.filter((e) => e.index > lastIndex);
}

export function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e, idx) => `${idx + 1}. [${e.role}] ${e.content}`)
    .join("\n");
}
