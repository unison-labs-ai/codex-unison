/**
 * Signal-based filtering for memory capture.
 * Groups transcript entries into turns, finds turns with meaningful signals,
 * and includes N turns before each signal for context.
 */

import { getSignalConfig } from "../config.js";
import type { TranscriptEntry } from "./transcript.js";

export interface Turn {
  userEntries: TranscriptEntry[];
  assistantEntries: TranscriptEntry[];
  allEntries: TranscriptEntry[];
}

export function hasSignal(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function getEntryText(entry: TranscriptEntry): string {
  return entry.content || "";
}

export function groupEntriesIntoTurns(entries: TranscriptEntry[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: Turn = { userEntries: [], assistantEntries: [], allEntries: [] };

  for (const entry of entries) {
    if (entry.role === "user") {
      if (currentTurn.assistantEntries.length > 0) {
        turns.push(currentTurn);
        currentTurn = { userEntries: [], assistantEntries: [], allEntries: [] };
      }
      currentTurn.userEntries.push(entry);
      currentTurn.allEntries.push(entry);
    } else if (entry.role === "assistant") {
      currentTurn.assistantEntries.push(entry);
      currentTurn.allEntries.push(entry);
    }
  }

  if (currentTurn.allEntries.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}

function getTurnUserText(turn: Turn): string {
  return turn.userEntries
    .map((e) => getEntryText(e))
    .join(" ")
    .toLowerCase();
}

export function findSignalTurnIndices(turns: Turn[], keywords: string[]): number[] {
  const signalIndices: number[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const userText = getTurnUserText(turn);

    if (hasSignal(userText, keywords)) {
      signalIndices.push(i);
      continue;
    }

    const assistantText = turn.assistantEntries
      .map((e) => getEntryText(e))
      .join(" ")
      .toLowerCase();

    if (hasSignal(assistantText, keywords)) {
      signalIndices.push(i);
    }
  }

  return signalIndices;
}

export function getTurnsAroundSignals(
  turns: Turn[],
  signalIndices: number[],
  turnsBefore: number,
): Turn[] {
  if (signalIndices.length === 0) return [];

  const includeSet = new Set<number>();

  for (const signalIdx of signalIndices) {
    const startIdx = Math.max(0, signalIdx - turnsBefore);
    for (let i = startIdx; i <= signalIdx; i++) {
      includeSet.add(i);
    }
  }

  const sortedIndices = Array.from(includeSet).sort((a, b) => a - b);
  return sortedIndices.map((idx) => turns[idx]);
}

export function filterBySignals(entries: TranscriptEntry[]): TranscriptEntry[] {
  const config = getSignalConfig();

  if (!config.enabled) {
    return entries;
  }

  const turns = groupEntriesIntoTurns(entries);
  if (turns.length === 0) return [];

  const signalIndices = findSignalTurnIndices(turns, config.keywords);
  if (signalIndices.length === 0) return [];

  const turnsToInclude = getTurnsAroundSignals(turns, signalIndices, config.turnsBefore);

  const result: TranscriptEntry[] = [];
  for (const turn of turnsToInclude) {
    result.push(...turn.allEntries);
  }

  return result;
}
