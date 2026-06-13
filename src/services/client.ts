/**
 * Real Unison brain client.
 *
 * Talks directly to the Unison brain REST API at ${UNISON_API_URL}/v1/<path>
 * using the UNISON_TOKEN (usk_live_...) key sent as `Authorization: Bearer <token>`.
 *
 * All methods make real network calls — no mocks, no stubs.
 */
import { CONFIG, isConfigured, getApiBaseUrl, getApiTokenValue, PLUGIN_VERSION } from "../config.js";
import { log } from "./logger.js";
import type { BrainSearchResult, BrainDocument, BrainStatus } from "../types/index.js";

const TIMEOUT_MS = 30000;
const CODEX_SOURCE = "codex";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let id: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    id = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(id));
}

/** Canonical search result used across the codebase. */
export interface SearchResultItem {
  path?: string;
  title?: string;
  tldr?: string;
  score?: number;
  highlight?: string;
  // Unified text accessor — populated by normalizeResult()
  memory?: string;
}

export interface SearchResponse {
  success: boolean;
  results?: SearchResultItem[];
  total?: number;
  error?: string;
}

export interface ProfileResult {
  success: boolean;
  profile: {
    static: string[];
    dynamic: string[];
  } | null;
  searchResults?: {
    results: SearchResultItem[];
    total: number;
  };
  error?: string;
}

function normalizeResult(raw: BrainSearchResult): SearchResultItem {
  const doc = raw.doc ?? {};
  const text = doc.tldr || doc.title || raw.highlight || "";
  return {
    path: doc.path,
    title: doc.title,
    tldr: doc.tldr,
    score: raw.score,
    highlight: raw.highlight,
    memory: text,
  };
}

export class UnisonBrainClient {
  private baseUrl: string;
  private token: string | undefined;

  constructor() {
    this.baseUrl = getApiBaseUrl().replace(/\/+$/, "");
    this.token = getApiTokenValue();
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-unison-source": CODEX_SOURCE,
      "x-unison-client-version": PLUGIN_VERSION,
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | string[] | number | boolean | undefined>,
  ): Promise<T> {
    if (!isConfigured()) {
      throw new Error("UNISON_TOKEN is not set");
    }

    let url = `${this.baseUrl}/v1/${path.replace(/^\//, "")}`;

    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) qs.append(k, String(item));
        } else {
          qs.set(k, String(v));
        }
      }
      const qStr = qs.toString();
      if (qStr) url += `?${qStr}`;
    }

    const resp = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try {
        const errBody = (await resp.json()) as { error?: { message?: string; code?: string } };
        errMsg = errBody?.error?.message ?? errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    return resp.json() as Promise<T>;
  }

  /**
   * Hybrid search over the brain.
   * Maps Unison search results to the common SearchResultItem shape.
   */
  async searchBrain(query: string, opts?: {
    limit?: number;
    tags?: string[];
    kind?: string[];
  }): Promise<SearchResponse> {
    log("searchBrain: start", { query: query.slice(0, 80), opts });
    try {
      const params: Record<string, string | string[] | number | undefined> = {
        q: query,
        k: opts?.limit ?? CONFIG.maxMemories,
      };
      if (opts?.tags?.length) params["tag"] = opts.tags;
      if (opts?.kind?.length) params["kind"] = opts.kind;

      const result = await withTimeout(
        this.request<{ results: BrainSearchResult[] }>("GET", "brain/search", undefined, params),
        TIMEOUT_MS,
      );

      const results = (result.results ?? []).map(normalizeResult);
      log("searchBrain: success", { count: results.length });
      return { success: true, results, total: results.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("searchBrain: error", { error: errorMessage });
      return { success: false, error: errorMessage, results: [], total: 0 };
    }
  }

  /**
   * Read a brain document by path.
   */
  async readDoc(path: string): Promise<{ success: true; doc: BrainDocument } | { success: false; error: string }> {
    log("readDoc: start", { path });
    try {
      const doc = await withTimeout(
        this.request<BrainDocument>("GET", "brain/doc", undefined, { path }),
        TIMEOUT_MS,
      );
      log("readDoc: success", { path });
      return { success: true, doc };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("readDoc: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Write or create a brain document.
   * Path must end in .md and be under /private/, /workspace/, or /workspace/teams/<slug>/.
   */
  async writeDoc(opts: {
    path: string;
    bodyMd: string;
    kind?: string;
    title?: string;
    tags?: string[];
  }): Promise<{ success: true; path: string } | { success: false; error: string }> {
    log("writeDoc: start", { path: opts.path, bodyLength: opts.bodyMd.length });
    try {
      const doc = await withTimeout(
        this.request<BrainDocument>("PUT", "brain/doc", {
          path: opts.path,
          bodyMd: opts.bodyMd,
          kind: opts.kind ?? "note",
          title: opts.title,
          tags: opts.tags,
          source: { kind: "manual", ref: CODEX_SOURCE },
        }),
        TIMEOUT_MS,
      );
      log("writeDoc: success", { path: doc.path });
      return { success: true, path: doc.path };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("writeDoc: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Surgical in-place edit of a brain document.
   * oldStr must match exactly once in the document body.
   */
  async editDoc(opts: {
    path: string;
    oldStr: string;
    newStr: string;
  }): Promise<{ success: true } | { success: false; error: string }> {
    log("editDoc: start", { path: opts.path });
    try {
      await withTimeout(
        this.request<BrainDocument>("PATCH", "brain/doc", {
          path: opts.path,
          oldStr: opts.oldStr,
          newStr: opts.newStr,
        }),
        TIMEOUT_MS,
      );
      log("editDoc: success", { path: opts.path });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("editDoc: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Delete a brain document.
   */
  async deleteDoc(path: string): Promise<{ success: true } | { success: false; error: string }> {
    log("deleteDoc: start", { path });
    try {
      await withTimeout(
        this.request<{ deleted: boolean }>("DELETE", "brain/doc", undefined, { path }),
        TIMEOUT_MS,
      );
      log("deleteDoc: success", { path });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("deleteDoc: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * List documents in the brain.
   */
  async listDocs(opts?: {
    prefix?: string;
    tags?: string[];
    limit?: number;
  }): Promise<{ success: true; documents: BrainDocument[] } | { success: false; error: string }> {
    log("listDocs: start", opts);
    try {
      const params: Record<string, string | string[] | number | undefined> = {};
      if (opts?.prefix) params["prefix"] = opts.prefix;
      if (opts?.tags?.length) params["tag"] = opts.tags;
      if (opts?.limit) params["limit"] = opts.limit;

      const result = await withTimeout(
        this.request<{ documents: BrainDocument[] }>("GET", "brain/list", undefined, params),
        TIMEOUT_MS,
      );
      log("listDocs: success", { count: result.documents?.length ?? 0 });
      return { success: true, documents: result.documents ?? [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("listDocs: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get brain health / stats.
   */
  async getStatus(): Promise<{ success: true; status: BrainStatus } | { success: false; error: string }> {
    log("getStatus: start");
    try {
      const status = await withTimeout(
        this.request<BrainStatus>("GET", "brain/status"),
        TIMEOUT_MS,
      );
      log("getStatus: success");
      return { success: true, status };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("getStatus: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify the current token via /v1/auth/whoami.
   */
  async whoami(): Promise<{
    success: true;
    user: { id: string; email: string };
    workspace: { id: string; name: string; verified: boolean };
    scopes: string[];
  } | { success: false; error: string }> {
    log("whoami: start");
    try {
      const result = await withTimeout(
        this.request<{
          user: { id: string; email: string };
          workspace: { id: string; name: string; verified: boolean };
          scopes: string[];
        }>("GET", "auth/whoami"),
        TIMEOUT_MS,
      );
      log("whoami: success");
      return { success: true, ...result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("whoami: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Build a pseudo-profile from the brain's most recent session docs.
   * Unison doesn't have a separate profile API; we synthesize one by
   * searching for preference/decision memories tagged with the user tag.
   */
  async getProfile(userTag: string, query?: string): Promise<ProfileResult> {
    log("getProfile: start", { userTag, hasQuery: !!query });
    try {
      // Search for preference / project-config docs tagged to this user
      const searchQuery = query || "coding preferences decisions patterns";
      const result = await this.searchBrain(searchQuery, {
        limit: CONFIG.maxProfileItems,
        tags: [userTag],
      });

      if (!result.success || !result.results?.length) {
        return { success: true, profile: { static: [], dynamic: [] } };
      }

      const static_: string[] = [];
      const dynamic_: string[] = [];

      for (const r of result.results) {
        const text = r.tldr || r.title || r.highlight || "";
        if (!text) continue;
        if ((r.score ?? 0) >= 0.7) {
          static_.push(text);
        } else {
          dynamic_.push(text);
        }
      }

      log("getProfile: success", { static: static_.length, dynamic: dynamic_.length });
      return {
        success: true,
        profile: { static: static_, dynamic: dynamic_ },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("getProfile: error", { error: errorMessage });
      return { success: false, error: errorMessage, profile: null };
    }
  }

  /**
   * Combined profile + search — mirrors supermemory's getProfileWithSearch().
   * Returns profile facts and relevant memories for a given query in one call.
   */
  async getProfileWithSearch(userTag: string, query?: string): Promise<ProfileResult> {
    log("getProfileWithSearch: start", { userTag, hasQuery: !!query });
    try {
      const [profileResult, searchResult] = await Promise.all([
        this.getProfile(userTag),
        query ? this.searchBrain(query, { limit: CONFIG.maxMemories, tags: [userTag] }) : Promise.resolve(null),
      ]);

      const seen = new Set<string>();
      const dedupeWithSeen = (items: string[]): string[] =>
        items.filter((item) => {
          const key = item.toLowerCase().trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const staticFacts = dedupeWithSeen(profileResult.profile?.static ?? []);
      const dynamicFacts = dedupeWithSeen(profileResult.profile?.dynamic ?? []);

      let searchResults: ProfileResult["searchResults"];
      if (searchResult?.success && searchResult.results?.length) {
        const deduped = searchResult.results.filter((r) => {
          const key = (r.memory || "").toLowerCase().trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        searchResults = { results: deduped, total: deduped.length };
      }

      log("getProfileWithSearch: success", {
        staticCount: staticFacts.length,
        dynamicCount: dynamicFacts.length,
        searchCount: searchResults?.results.length ?? 0,
      });

      return {
        success: true,
        profile: { static: staticFacts, dynamic: dynamicFacts },
        searchResults,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("getProfileWithSearch: error", { error: errorMessage });
      return { success: false, error: errorMessage, profile: null };
    }
  }

  /**
   * Save a memory to the brain.
   * Writes a document under /private/sessions/<sessionId>.md, appending
   * content incrementally (PATCH if exists, PUT otherwise).
   */
  async addMemory(
    content: string,
    tag: string,
    metadata?: { type?: string; sessionId?: string; [key: string]: unknown },
    options?: { customId?: string },
  ): Promise<{ success: true; path: string } | { success: false; error: string }> {
    log("addMemory: start", { tag, contentLength: content.length });

    const rawSessionId = options?.customId || metadata?.sessionId || `session-${Date.now()}`;
    // Sanitize: replace underscores and any chars not in [a-z0-9\-/.] with hyphens
    const sessionId = rawSessionId.toLowerCase().replace(/[^a-z0-9\-/.]/g, "-");
    const docPath = `/private/sessions/${sessionId}.md`;

    const frontmatter = [
      "---",
      `tag: ${tag}`,
      `source: codex`,
      `plugin_version: ${PLUGIN_VERSION}`,
      `type: ${metadata?.type ?? "conversation"}`,
      `updated: ${new Date().toISOString()}`,
      "---",
      "",
    ].join("\n");

    try {
      // Try to read existing doc and append
      const existing = await this.readDoc(docPath);
      if (existing.success) {
        const existingBody = existing.doc.bodyMd ?? "";
        const separator = existingBody.endsWith("\n") ? "" : "\n";
        const newBody = existingBody + separator + content + "\n";
        const editResult = await this.writeDoc({
          path: docPath,
          bodyMd: newBody,
          kind: "note",
          tags: [tag, "codex-session"],
        });
        log("addMemory: updated existing doc", { path: docPath });
        return editResult;
      }

      // Create new doc
      const bodyMd = frontmatter + content + "\n";
      const writeResult = await this.writeDoc({
        path: docPath,
        bodyMd,
        kind: "note",
        tags: [tag, "codex-session"],
      });
      log("addMemory: created new doc", { path: docPath });
      return writeResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("addMemory: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Delete a memory (search first by content, then delete the matching doc).
   */
  async forgetMemory(
    content: string,
    tag: string,
  ): Promise<{ success: true; message: string; path?: string } | { success: false; error: string }> {
    log("forgetMemory: start", { tag, contentLength: content.length });
    try {
      const searchResult = await this.searchBrain(content, {
        limit: 1,
        tags: [tag],
      });

      if (!searchResult.success || !searchResult.results?.length) {
        return { success: true, message: "No matching memory found" };
      }

      const docPath = searchResult.results[0].path;
      if (!docPath) {
        return { success: true, message: "Memory found but path unavailable" };
      }

      const deleteResult = await this.deleteDoc(docPath);
      if (deleteResult.success) {
        log("forgetMemory: success", { path: docPath });
        return { success: true, message: "Memory forgotten", path: docPath };
      }
      return { success: false, error: "Failed to delete document" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("forgetMemory: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }
}
