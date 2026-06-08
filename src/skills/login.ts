import { unlinkSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { isConfigured } from "../config.js";
import { startAuthFlow, AUTH_BASE_URL, CREDENTIALS_FILE } from "../services/auth.js";

const UNISON_DIR = join(homedir(), ".codex", "unison");
const AUTH_ATTEMPTED_FILE = join(UNISON_DIR, ".auth-attempted");
const LOGGED_OUT_FILE = join(UNISON_DIR, ".logged-out");

async function main(): Promise<void> {
  try {
    if (existsSync(LOGGED_OUT_FILE)) unlinkSync(LOGGED_OUT_FILE);
  } catch {}

  if (isConfigured()) {
    console.log("Already authenticated with Unison. Memory is active.");
    console.log(`To re-authenticate, remove ${CREDENTIALS_FILE} and run this again.`);
    process.exit(0);
  }

  // Clear the auth-attempted marker so the recall hook will try browser auth again.
  try {
    if (existsSync(AUTH_ATTEMPTED_FILE)) unlinkSync(AUTH_ATTEMPTED_FILE);
  } catch {}

  console.log("Opening browser to authenticate with Unison...");
  console.log(`If the browser does not open, visit: ${AUTH_BASE_URL}`);

  try {
    await startAuthFlow();
    try {
      if (existsSync(AUTH_ATTEMPTED_FILE)) unlinkSync(AUTH_ATTEMPTED_FILE);
    } catch {}
    console.log("\nAuthenticated successfully! Unison memory is now active.");
    process.exit(0);
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === "AUTH_TIMEOUT";
    if (isTimeout) {
      console.error("\nAuthentication timed out. Please try again.");
    } else {
      console.error("\nAuthentication failed:", err instanceof Error ? err.message : err);
    }
    console.error(`\nAlternatively, set the token manually:`);
    console.error(`  export UNISON_TOKEN="usk_live_..."`);
    console.error(`  Get your token at: https://app.unisonlabs.ai`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
