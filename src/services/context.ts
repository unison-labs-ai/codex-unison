import type { ProfileResult, SearchResponse } from "./client.js";
import { normalizeFact } from "./factCache.js";

interface ProfileShape {
  static?: string[];
  dynamic?: string[];
}

interface ProfileResponse {
  success: boolean;
  profile?: ProfileShape | string | null;
}

function formatProfile(
  profile: ProfileShape | string | null | undefined,
  maxItems: number,
): string | null {
  if (!profile) return null;
  if (typeof profile === "string") {
    return profile.trim() || null;
  }
  const items = [
    ...(profile.static ?? []),
    ...(profile.dynamic ?? []),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
  if (items.length === 0) return null;
  return items.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

export interface FormattedContext {
  text: string;
  newFacts: string[];
}

/**
 * Format context from combined profile + search result.
 * Accepts an optional separate project search result to merge project-scoped
 * memories alongside user-scoped ones from the profile.
 *
 * Memories from both sources are interleaved so that neither source is
 * entirely crowded out when the total exceeds maxMemories.
 *
 * Facts already seen in this session (passed via `seenFacts`) are skipped
 * to avoid wasting tokens on repeated context.
 */
export function formatCombinedContext(
  result: ProfileResult,
  maxMemories: number,
  maxProfileItems: number,
  projectSearchResult?: SearchResponse,
  seenFacts: Set<string> = new Set(),
): FormattedContext {
  const parts: string[] = [];
  const newFacts: string[] = [];

  if (result.success && result.profile) {
    const items = [...(result.profile.static ?? []), ...(result.profile.dynamic ?? [])]
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !seenFacts.has(normalizeFact(s)))
      .slice(0, maxProfileItems);
    if (items.length > 0) {
      parts.push(
        `[User Profile]\n${items.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      );
      newFacts.push(...items);
    }
  }

  const seenKeys = new Set<string>();

  function dedupKey(path: string | undefined, text: string): string {
    if (path) return `path:${path}`;
    return `content:${text.toLowerCase().trim()}`;
  }

  const userMemories: string[] = [];
  if (result.searchResults && result.searchResults.results.length > 0) {
    for (const r of result.searchResults.results) {
      const text = r.memory || r.tldr || r.title || "";
      if (!text || seenFacts.has(normalizeFact(text))) continue;
      const key = dedupKey(r.path, text);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        userMemories.push(text);
      }
    }
  }

  const projectMemories: string[] = [];
  if (projectSearchResult?.success && projectSearchResult.results && projectSearchResult.results.length > 0) {
    for (const r of projectSearchResult.results) {
      const text = r.memory || r.tldr || r.title || "";
      if (!text || seenFacts.has(normalizeFact(text))) continue;
      const key = dedupKey(r.path, text);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        projectMemories.push(text);
      }
    }
  }

  // Interleave user and project memories
  const allMemories: string[] = [];
  let ui = 0;
  let pi = 0;
  while (allMemories.length < maxMemories && (ui < userMemories.length || pi < projectMemories.length)) {
    if (ui < userMemories.length) {
      allMemories.push(userMemories[ui++]);
    }
    if (allMemories.length < maxMemories && pi < projectMemories.length) {
      allMemories.push(projectMemories[pi++]);
    }
  }

  if (allMemories.length > 0) {
    const memories = allMemories
      .map((m, i) => `${i + 1}. ${m}`)
      .filter((m) => m.trim().length > 2)
      .join("\n");
    if (memories) {
      parts.push(`[Relevant Memories]\n${memories}`);
      newFacts.push(...allMemories);
    }
  }

  return { text: parts.join("\n\n"), newFacts };
}

/**
 * Format context from separate search + profile results.
 * Used by the search skill which makes its own API calls.
 */
export function formatContextForPrompt(
  searchResult: SearchResponse,
  profileResult: ProfileResponse,
  maxMemories: number,
  maxProfileItems: number,
): string {
  const parts: string[] = [];

  if (profileResult.success) {
    const profileText = formatProfile(profileResult.profile, maxProfileItems);
    if (profileText) {
      parts.push(`[User Profile]\n${profileText}`);
    }
  }

  if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
    const memories = searchResult.results
      .slice(0, maxMemories)
      .map((r, i) => `${i + 1}. ${r.memory ?? r.tldr ?? r.title ?? ""}`)
      .filter((m) => m.trim().length > 2)
      .join("\n");
    if (memories) {
      parts.push(`[Relevant Memories]\n${memories}`);
    }
  }

  return parts.join("\n\n");
}
