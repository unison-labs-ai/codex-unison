import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { CREDENTIALS_FILE } from "../services/auth.js";

const UNISON_DIR = join(homedir(), ".codex", "unison");
const AUTH_ATTEMPTED_FILE = join(UNISON_DIR, ".auth-attempted");
const LOGGED_OUT_FILE = join(UNISON_DIR, ".logged-out");
const CONFIG_FILE = join(homedir(), ".codex", "unison.json");

function removeFile(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  } catch (error) {
    console.error(`Failed to remove ${path}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function removeConfigToken(): boolean {
  try {
    if (!existsSync(CONFIG_FILE)) return false;
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(parsed, "token")) return false;
    delete parsed.token;
    writeFileSync(CONFIG_FILE, `${JSON.stringify(parsed, null, 2)}\n`);
    return true;
  } catch (error) {
    console.error(`Failed to update ${CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function main(): void {
  const removedCredentials = removeFile(CREDENTIALS_FILE);
  const removedAuthMarker = removeFile(AUTH_ATTEMPTED_FILE);
  const removedConfigToken = removeConfigToken();
  const envTokenSet = !!process.env.UNISON_TOKEN;
  mkdirSync(UNISON_DIR, { recursive: true });
  writeFileSync(LOGGED_OUT_FILE, new Date().toISOString());

  if (removedCredentials || removedConfigToken || removedAuthMarker) {
    console.log("Logged out of Unison for Codex.");
  } else {
    console.log("No saved Unison login was found.");
  }

  if (removedCredentials) {
    console.log(`Removed credentials file: ${CREDENTIALS_FILE}`);
  }
  if (removedConfigToken) {
    console.log(`Removed token from ${CONFIG_FILE}`);
  }

  if (envTokenSet) {
    console.log("");
    console.log("UNISON_TOKEN is still set in this shell, so memory may remain active until you unset it or restart Codex.");
  } else {
    console.log("Unison memory is inactive until you run /unison-login again.");
    console.log("This only logs out this local Codex install. To revoke the account-level token, visit https://app.unisonlabs.ai.");
  }
}

main();
