import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadCredentialData, loadCredentials } from "./services/auth.js";

export const CONFIG_FILE = join(homedir(), ".codex", "unison.json");
export const PLUGIN_VERSION = "1.0.0";

export interface CustomTag {
  tag: string;
  description: string;
}

interface CodexUnisonConfig {
  token?: string;
  similarityThreshold?: number;
  maxMemories?: number;
  maxProfileItems?: number;
  injectProfile?: boolean;
  userTagPrefix?: string;
  projectTagPrefix?: string;
  filterPrompt?: string;
  debug?: boolean;
  signalExtraction?: boolean;
  signalKeywords?: string[];
  signalTurnsBefore?: number;
  autoRecallEveryPrompt?: boolean;
  captureEveryNTurns?: number;
  enableCustomTags?: boolean;
  customTags?: CustomTag[];
  customTagInstructions?: string;
}

const DEFAULT_SIGNAL_KEYWORDS = [
  "prefer", "like", "love", "use", "hate", "dislike", "avoid",
  "remember", "forget", "note",
  "decision", "decided", "chose", "choose", "picked", "switched", "moved", "migrated",
  "architecture", "pattern", "approach", "design", "tradeoff",
  "implementation", "refactor", "upgrade", "deprecate",
  "bug", "fix", "fixed", "solved", "solution", "important",
  "stack", "framework", "library", "tool", "database",
];

const DEFAULTS = {
  similarityThreshold: 0.6,
  maxMemories: 5,
  maxProfileItems: 5,
  injectProfile: true,
  filterPrompt:
    "You are a stateful coding agent. Remember all the information, including but not limited to user's coding preferences, tech stack, behaviours, workflows, and any other relevant details.",
  debug: false,
  signalExtraction: false,
  signalKeywords: DEFAULT_SIGNAL_KEYWORDS,
  signalTurnsBefore: 3,
  autoRecallEveryPrompt: false,
  captureEveryNTurns: 0,
};

function loadRawConfig(): { config: CodexUnisonConfig; existed: boolean } {
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      return { config: JSON.parse(content) as CodexUnisonConfig, existed: true };
    } catch {
      return { config: {}, existed: true };
    }
  }
  return { config: {}, existed: false };
}

const { config: fileConfig, existed: configExisted } = loadRawConfig();

function resolveCaptureEveryNTurns(config: CodexUnisonConfig): number {
  if (config.captureEveryNTurns !== undefined) return config.captureEveryNTurns;
  if (configExisted) return 3;
  return DEFAULTS.captureEveryNTurns;
}

function resolveAutoRecallEveryPrompt(config: CodexUnisonConfig): boolean {
  if (config.autoRecallEveryPrompt !== undefined) return config.autoRecallEveryPrompt;
  if (configExisted) return true;
  return DEFAULTS.autoRecallEveryPrompt;
}

function getToken(): string | undefined {
  // Priority: env var > config file > credentials file
  if (process.env.UNISON_TOKEN) return process.env.UNISON_TOKEN;
  if (fileConfig.token) return fileConfig.token;
  return loadCredentials();
}

export let UNISON_TOKEN = getToken();

export function reloadToken(): void {
  UNISON_TOKEN = getToken();
}

export const CONFIG = {
  similarityThreshold: fileConfig.similarityThreshold ?? DEFAULTS.similarityThreshold,
  maxMemories: fileConfig.maxMemories ?? DEFAULTS.maxMemories,
  maxProfileItems: fileConfig.maxProfileItems ?? DEFAULTS.maxProfileItems,
  injectProfile: fileConfig.injectProfile ?? DEFAULTS.injectProfile,
  userTagPrefix: fileConfig.userTagPrefix,
  projectTagPrefix: fileConfig.projectTagPrefix,
  filterPrompt: fileConfig.filterPrompt ?? DEFAULTS.filterPrompt,
  debug: fileConfig.debug ?? DEFAULTS.debug,
  signalExtraction: fileConfig.signalExtraction ?? DEFAULTS.signalExtraction,
  signalKeywords: fileConfig.signalKeywords ?? DEFAULTS.signalKeywords,
  signalTurnsBefore: fileConfig.signalTurnsBefore ?? DEFAULTS.signalTurnsBefore,
  autoRecallEveryPrompt: resolveAutoRecallEveryPrompt(fileConfig),
  captureEveryNTurns: resolveCaptureEveryNTurns(fileConfig),
  enableCustomTags: fileConfig.enableCustomTags ?? false,
  customTags: (fileConfig.customTags ?? []).filter(
    (c): c is CustomTag =>
      !!c && typeof c.tag === "string" && typeof c.description === "string",
  ),
  customTagInstructions: fileConfig.customTagInstructions ?? "",
};

export function isConfigured(): boolean {
  return !!UNISON_TOKEN;
}

export function getApiTokenValue(): string | undefined {
  return UNISON_TOKEN;
}

export function getApiBaseUrl(): string {
  return (
    process.env.UNISON_API_URL ||
    loadCredentialData()?.apiBaseUrl ||
    "https://brain.unisonlabs.ai"
  );
}

export function getSignalConfig(): {
  enabled: boolean;
  keywords: string[];
  turnsBefore: number;
} {
  return {
    enabled: CONFIG.signalExtraction,
    keywords: CONFIG.signalKeywords.map((k) => k.toLowerCase()),
    turnsBefore: CONFIG.signalTurnsBefore,
  };
}

export function getFilterPrompt(): string {
  return CONFIG.filterPrompt;
}

export function getTagCatalog(): string | null {
  if (!CONFIG.enableCustomTags || CONFIG.customTags.length === 0) {
    return null;
  }

  const lines: string[] = [];
  lines.push("Custom memory tags are available for organizing memories:");
  lines.push("");
  for (const c of CONFIG.customTags) {
    lines.push(`- \`${c.tag}\`: ${c.description}`);
  }

  if (CONFIG.customTagInstructions) {
    lines.push("");
    lines.push(CONFIG.customTagInstructions);
  }

  lines.push("");
  lines.push(
    "When saving memories with /unison-save, use --tag <tag> to route to a specific category.",
  );
  lines.push(
    "When searching with /unison-search, use --tag <tag> to search a specific category.",
  );
  lines.push(
    "When forgetting with /unison-forget, use --tag <tag> to target a specific category.",
  );
  lines.push("If no tag is specified, memories go to the default project/user categories.");

  return lines.join("\n");
}

export function validateCustomTag(tag: string): string | null {
  if (!CONFIG.enableCustomTags || CONFIG.customTags.length === 0) {
    return "Custom tags are not enabled. Remove --tag or set enableCustomTags in config.";
  }

  const validTags = CONFIG.customTags.map((c) => c.tag);
  if (validTags.includes(tag)) {
    return null;
  }

  const validList = validTags.map((t) => `'${t}'`).join(", ");
  return `Unknown tag '${tag}'. Valid tags: ${validList}`;
}

export function writeInstallDefaults(isExistingInstall: boolean): void {
  const current = loadRawConfig().config;
  const next: CodexUnisonConfig = { ...current };

  if (isExistingInstall) {
    if (next.autoRecallEveryPrompt === undefined) {
      next.autoRecallEveryPrompt = true;
    }
    if (next.captureEveryNTurns === undefined) {
      next.captureEveryNTurns = 3;
    }
  } else {
    next.autoRecallEveryPrompt = false;
    next.captureEveryNTurns = 0;
  }

  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
}

export function getRecallModeSummary(): string {
  if (CONFIG.autoRecallEveryPrompt) {
    return "legacy: recall on every prompt";
  }
  if (CONFIG.captureEveryNTurns > 0) {
    return `unified: session-start profile + capture every ${CONFIG.captureEveryNTurns} turns + session-end flush`;
  }
  return "unified: session-start profile + session-end flush only";
}
