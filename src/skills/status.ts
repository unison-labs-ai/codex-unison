import { getApiBaseUrl, getApiTokenValue, isConfigured, CONFIG } from "../config.js";
import { CREDENTIALS_FILE, loadCredentials } from "../services/auth.js";
import { UnisonBrainClient } from "../services/client.js";
import { getTags } from "../services/tags.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = join(homedir(), ".codex", "unison.json");

function maskKey(key: string | undefined): string {
  if (!key) return "not set";
  if (key.length <= 12) return `${key.slice(0, 6)}...`;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function getConfiguredTokenFromFile(): string | undefined {
  try {
    if (!existsSync(CONFIG_FILE)) return undefined;
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as { token?: string };
    return parsed.token;
  } catch {
    return undefined;
  }
}

function getTokenSource(): string {
  if (process.env.UNISON_TOKEN) return "UNISON_TOKEN env var";
  if (getConfiguredTokenFromFile()) return "~/.codex/unison.json";
  if (loadCredentials()) return "~/.codex/unison/credentials.json";
  return "not configured";
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const tags = getTags(cwd);
  const token = getApiTokenValue();
  const apiUrl = getApiBaseUrl();
  const lines: string[] = [];

  lines.push("unison status");
  lines.push("");
  lines.push(`Connected: ${isConfigured() ? "checking..." : "no"}`);
  lines.push(`Token: ${maskKey(token)} (${getTokenSource()})`);
  lines.push(`API URL: ${apiUrl}`);
  lines.push(`Recall mode: ${CONFIG.autoRecallEveryPrompt ? "auto-recall on every prompt" : "session-start profile + session-end flush"}`);
  lines.push(`Capture cadence: ${CONFIG.captureEveryNTurns > 0 ? `every ${CONFIG.captureEveryNTurns} turn${CONFIG.captureEveryNTurns === 1 ? "" : "s"} + session end` : "session end only"}`);
  lines.push(`Project tag: ${tags.project}`);
  lines.push(`User tag: ${tags.user}`);

  if (!isConfigured()) {
    lines[2] = "Connected: no";
    lines.push("");
    lines.push("Run /unison-login to connect, or set UNISON_TOKEN.");
    console.log(lines.join("\n"));
    process.exit(0);
  }

  const client = new UnisonBrainClient();
  const [whoamiResult, statusResult] = await Promise.all([
    client.whoami(),
    client.getStatus(),
  ]);

  lines[2] = whoamiResult.success ? "Connected: yes" : "Connected: no";

  if (whoamiResult.success) {
    lines.push("");
    lines.push("Account:");
    lines.push(`  Email: ${whoamiResult.user.email}`);
    lines.push(`  User ID: ${whoamiResult.user.id}`);
    lines.push(`  Tenant: ${whoamiResult.tenant.name} (${whoamiResult.tenant.id})`);
    lines.push(`  Verified: ${whoamiResult.tenant.verified ? "yes" : "no"}`);
    lines.push(`  Scopes: ${whoamiResult.scopes.join(", ")}`);
  }

  if (statusResult.success) {
    lines.push("");
    lines.push("Brain stats:");
    lines.push(`  Documents: ${statusResult.status.docCount}`);
    lines.push(`  Entities: ${statusResult.status.entityCount}`);
    lines.push(`  Facts: ${statusResult.status.factCount}`);
    if (statusResult.status.lastIngestAt) {
      lines.push(`  Last ingest: ${statusResult.status.lastIngestAt}`);
    }
  }

  if (!whoamiResult.success) {
    lines.push("");
    lines.push(`Connection check failed: ${whoamiResult.error}`);
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(`Failed to get Unison status: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
