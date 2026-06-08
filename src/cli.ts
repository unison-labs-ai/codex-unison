import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { loadCredentials } from "./services/auth.js";
import { writeInstallDefaults, CONFIG_FILE, getRecallModeSummary, CONFIG } from "./config.js";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import * as TOML from "@iarna/toml";

declare const __dirname: string | undefined;
function getScriptDir(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  // eslint-disable-next-line no-eval
  const importMetaUrl = (eval("import.meta.url") as string) ?? "";
  return dirname(fileURLToPath(importMetaUrl));
}

const CODEX_DIR = join(homedir(), ".codex");
const CODEX_CONFIG_TOML = join(CODEX_DIR, "config.toml");
const CODEX_HOOKS_JSON = join(CODEX_DIR, "hooks.json");
const UNISON_HOOKS_DIR = join(CODEX_DIR, "unison");
const RECALL_SCRIPT = join(UNISON_HOOKS_DIR, "recall.js");
const FLUSH_SCRIPT = join(UNISON_HOOKS_DIR, "flush.js");
const SESSION_START_SCRIPT = join(UNISON_HOOKS_DIR, "session-start.js");
const CODEX_SKILLS_DIR = join(homedir(), ".codex", "skills");
const RECALL_TIMEOUT_SECONDS = 90;
const FLUSH_TIMEOUT_SECONDS = 60;
const SESSION_START_TIMEOUT_SECONDS = 60;

const SKILLS = [
  { name: "unison-search", script: "search-memory.js" },
  { name: "unison-save", script: "save-memory.js" },
  { name: "unison-forget", script: "forget-memory.js" },
  { name: "unison-status", script: "status.js" },
  { name: "unison-profile", script: "profile-memory.js" },
  { name: "unison-login", script: "login.js" },
  { name: "unison-logout", script: "logout.js" },
] as const;

const SCRIPT_DIR = getScriptDir();
const DIST_HOOKS_DIR = join(SCRIPT_DIR, "hooks");

function ensureCodexDir() {
  mkdirSync(CODEX_DIR, { recursive: true });
  mkdirSync(UNISON_HOOKS_DIR, { recursive: true });
}

function mergeConfigToml(enable: boolean) {
  if (!enable && !existsSync(CODEX_CONFIG_TOML)) {
    return;
  }

  let config: Record<string, unknown> = {};
  if (existsSync(CODEX_CONFIG_TOML)) {
    try {
      const content = readFileSync(CODEX_CONFIG_TOML, "utf-8");
      config = TOML.parse(content) as Record<string, unknown>;
    } catch {
      // start fresh
    }
  }

  if (!config.features) config.features = {};
  const features = config.features as Record<string, unknown>;
  if (enable) {
    features.codex_hooks = true;
  } else {
    delete features.codex_hooks;
    if (Object.keys(features).length === 0) delete config.features;
  }

  writeFileSync(CODEX_CONFIG_TOML, TOML.stringify(config as TOML.JsonMap));
}

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
  statusMessage?: string;
}

interface MatcherGroup {
  matcher?: string;
  hooks: HookEntry[];
}

interface HookEvents {
  UserPromptSubmit?: MatcherGroup[];
  Stop?: MatcherGroup[];
  SessionStart?: MatcherGroup[];
  [key: string]: MatcherGroup[] | undefined;
}

interface HooksJson {
  hooks?: HookEvents;
}

function normalizeHookEvents(raw: unknown): HookEvents {
  if (!raw || typeof raw !== "object") return {};

  const maybeWrapped = raw as HooksJson & HookEvents;
  const events =
    maybeWrapped.hooks && typeof maybeWrapped.hooks === "object"
      ? maybeWrapped.hooks
      : (maybeWrapped as HookEvents);

  for (const key of ["UserPromptSubmit", "Stop", "SessionStart"] as const) {
    const val = events[key];
    if (val !== undefined && !Array.isArray(val)) {
      events[key] = [val as unknown as MatcherGroup];
    }
  }

  return events;
}

function ensureHookRegistered(
  groups: MatcherGroup[],
  command: string,
  timeout: number,
  statusMessage: string,
): void {
  const exists = groups.some((g) => g.hooks.some((h) => h.command === command));
  if (exists) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        if (hook.command === command) {
          hook.timeout = timeout;
          hook.statusMessage = statusMessage;
        }
      }
    }
  } else {
    const globalGroup = groups.find((g) => !g.matcher);
    const entry: HookEntry = { type: "command", command, timeout, statusMessage };
    if (globalGroup) {
      globalGroup.hooks.push(entry);
    } else {
      groups.push({ hooks: [entry] });
    }
  }
}

function removeHookCommands(
  groups: MatcherGroup[],
  commands: string[],
): MatcherGroup[] {
  return groups
    .map((g) => ({ ...g, hooks: g.hooks.filter((h) => !commands.includes(h.command)) }))
    .filter((g) => g.hooks.length > 0);
}

function mergeHooksJson(add: boolean) {
  if (!add && !existsSync(CODEX_HOOKS_JSON)) {
    return;
  }

  let hooks: HookEvents = {};
  if (existsSync(CODEX_HOOKS_JSON)) {
    try {
      const content = readFileSync(CODEX_HOOKS_JSON, "utf-8");
      hooks = normalizeHookEvents(JSON.parse(content));
    } catch {
      // start fresh
    }
  }

  if (add) {
    const recallCmd = `node ${RECALL_SCRIPT}`;
    const flushCmd = `node ${FLUSH_SCRIPT}`;
    const sessionStartCmd = `node ${SESSION_START_SCRIPT}`;

    if (!hooks.SessionStart) hooks.SessionStart = [];
    ensureHookRegistered(
      hooks.SessionStart,
      sessionStartCmd,
      SESSION_START_TIMEOUT_SECONDS,
      "Loading Unison memory...",
    );

    if (!hooks.UserPromptSubmit) hooks.UserPromptSubmit = [];
    ensureHookRegistered(hooks.UserPromptSubmit, recallCmd, RECALL_TIMEOUT_SECONDS, "Searching Unison brain...");

    if (!hooks.Stop) hooks.Stop = [];
    ensureHookRegistered(hooks.Stop, flushCmd, FLUSH_TIMEOUT_SECONDS, "Saving to Unison brain...");
  } else {
    const recallCmd = `node ${RECALL_SCRIPT}`;
    const flushCmd = `node ${FLUSH_SCRIPT}`;
    const sessionStartCmd = `node ${SESSION_START_SCRIPT}`;

    if (hooks.SessionStart) {
      hooks.SessionStart = removeHookCommands(hooks.SessionStart, [sessionStartCmd]);
      if (hooks.SessionStart.length === 0) delete hooks.SessionStart;
    }
    if (hooks.UserPromptSubmit) {
      hooks.UserPromptSubmit = removeHookCommands(hooks.UserPromptSubmit, [recallCmd]);
      if (hooks.UserPromptSubmit.length === 0) delete hooks.UserPromptSubmit;
    }
    if (hooks.Stop) {
      hooks.Stop = removeHookCommands(hooks.Stop, [flushCmd]);
      if (hooks.Stop.length === 0) delete hooks.Stop;
    }
  }

  writeFileSync(CODEX_HOOKS_JSON, JSON.stringify({ hooks }, null, 2));
}

function install() {
  console.log("Installing codex-unison...\n");

  ensureCodexDir();

  const hadExistingConfig = existsSync(CONFIG_FILE);
  writeInstallDefaults(hadExistingConfig);

  const recallSrc = join(DIST_HOOKS_DIR, "recall.js");
  const flushSrc = join(DIST_HOOKS_DIR, "flush.js");
  const sessionStartSrc = join(DIST_HOOKS_DIR, "session-start.js");

  if (!existsSync(recallSrc) || !existsSync(flushSrc) || !existsSync(sessionStartSrc)) {
    console.error("Error: Hook scripts not found. Please reinstall the package.");
    process.exit(1);
  }

  copyFileSync(recallSrc, RECALL_SCRIPT);
  copyFileSync(flushSrc, FLUSH_SCRIPT);
  copyFileSync(sessionStartSrc, SESSION_START_SCRIPT);

  for (const { name, script } of SKILLS) {
    copyFileSync(
      join(SCRIPT_DIR, "skills", script),
      join(UNISON_HOOKS_DIR, script)
    );
    const skillDir = join(CODEX_SKILLS_DIR, name);
    mkdirSync(skillDir, { recursive: true });
    copyFileSync(
      join(SCRIPT_DIR, "skills", name, "SKILL.md"),
      join(skillDir, "SKILL.md")
    );
  }
  console.log(`✓ Installed hook and skill scripts to ${UNISON_HOOKS_DIR}`);
  console.log(`✓ Installed skills to ${CODEX_SKILLS_DIR}`);

  mergeConfigToml(true);
  console.log(`✓ Enabled codex_hooks in ${CODEX_CONFIG_TOML}`);

  mergeHooksJson(true);
  console.log(`✓ Registered hooks in ${CODEX_HOOKS_JSON}`);

  console.log(`
Installation complete!

You now have:
  • Session-start profile recall (${getRecallModeSummary()})
  • Explicit memory — unison-search, unison-save, unison-forget, unison-profile, unison-status, unison-login, and unison-logout skills

${hadExistingConfig
    ? "Existing install: config preserved in ~/.codex/unison.json.\n"
    : "Fresh install: session-start profile + session-end flush only.\nEnable autoRecallEveryPrompt or captureEveryNTurns in ~/.codex/unison.json if needed.\n"}

Next steps:
  1. Start Codex — on your first prompt, a browser window will open to
     authenticate with Unison automatically.

  Or authenticate manually:
     /unison-login        (inside Codex)
     export UNISON_TOKEN="usk_live_..."   (in your shell profile)

  2. Get a token at: https://app.unisonlabs.ai (if needed)

Optional: Enable debug logging:
  export UNISON_DEBUG=true
`);
}

function uninstall() {
  console.log("Uninstalling codex-unison...\n");

  mergeHooksJson(false);
  console.log(`✓ Removed hooks from ${CODEX_HOOKS_JSON}`);

  mergeConfigToml(false);
  console.log(`✓ Disabled codex_hooks in ${CODEX_CONFIG_TOML}`);

  if (existsSync(UNISON_HOOKS_DIR)) {
    rmSync(UNISON_HOOKS_DIR, { recursive: true, force: true });
    console.log(`✓ Removed ${UNISON_HOOKS_DIR}`);
  }

  for (const { name } of SKILLS) {
    const skillDir = join(CODEX_SKILLS_DIR, name);
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true });
    }
  }
  console.log(`✓ Removed skills from ${CODEX_SKILLS_DIR}`);

  console.log("\ncodex-unison uninstalled.");
}

function status() {
  const envToken = process.env.UNISON_TOKEN;
  const credentialsToken = !envToken ? loadCredentials() : undefined;
  const token = envToken || credentialsToken;
  const tokenSource = envToken
    ? "UNISON_TOKEN env var"
    : credentialsToken
    ? "credentials file (~/.codex/unison/credentials.json)"
    : null;

  const hooksInstalled =
    existsSync(RECALL_SCRIPT) &&
    existsSync(FLUSH_SCRIPT) &&
    existsSync(SESSION_START_SCRIPT);
  const hooksJsonExists = existsSync(CODEX_HOOKS_JSON);
  const configTomlExists = existsSync(CODEX_CONFIG_TOML);

  let hooksEnabled = false;
  if (hooksJsonExists) {
    try {
      const hooks = normalizeHookEvents(JSON.parse(readFileSync(CODEX_HOOKS_JSON, "utf-8")));
      const recallCmd = `node ${RECALL_SCRIPT}`;
      const flushCmd = `node ${FLUSH_SCRIPT}`;
      const sessionStartCmd = `node ${SESSION_START_SCRIPT}`;
      const recallRegistered = hooks.UserPromptSubmit?.some((g: MatcherGroup) =>
        g.hooks.some((h: HookEntry) => h.command === recallCmd)
      );
      const flushRegistered = hooks.Stop?.some((g: MatcherGroup) =>
        g.hooks.some((h: HookEntry) => h.command === flushCmd)
      );
      const sessionStartRegistered = hooks.SessionStart?.some((g: MatcherGroup) =>
        g.hooks.some((h: HookEntry) => h.command === sessionStartCmd)
      );
      hooksEnabled = !!(recallRegistered && flushRegistered && sessionStartRegistered);
    } catch {
      // ignore
    }
  }

  const skillsInstalled = SKILLS.every(({ name }) =>
    existsSync(join(CODEX_SKILLS_DIR, name, "SKILL.md"))
  );

  console.log("codex-unison status:\n");
  console.log(`  Token:         ${token ? `✓ set (${tokenSource})` : "✗ not set"}`);
  console.log(`  Recall mode:   ${getRecallModeSummary()}`);
  console.log(`  Hook scripts:  ${hooksInstalled ? `✓ installed at ${UNISON_HOOKS_DIR}` : "✗ not installed"}`);
  console.log(`  hooks.json:    ${hooksEnabled ? "✓ registered (implicit memory)" : "✗ not registered"}`);
  console.log(`  Skills:        ${skillsInstalled ? `✓ installed (${SKILLS.map(s => s.name).join(", ")})` : "✗ not installed"}`);
  console.log(`  config.toml:   ${configTomlExists ? "✓ exists" : "✗ not found"}`);

  if (!token || !hooksInstalled || !hooksEnabled || !skillsInstalled) {
    console.log("\nRun `npx codex-unison install` to set up.");
  } else {
    console.log("\nAll good! Memory is active.");
  }
}

const command = process.argv[2];
switch (command) {
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  case "status":
    status();
    break;
  default:
    console.log("Usage: codex-unison <install|uninstall|status>");
    process.exit(1);
}
