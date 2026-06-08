/**
 * Unison auth service.
 *
 * Machine-auth (headless): 3-step flow
 *   1. POST /v1/auth/provision  { email } → { apiKey, tenantId, status, emailSent }
 *   2. POST /v1/auth/verify     { email, code } → { verified, tenantId } or { verified, apiKey }
 *   3. POST /v1/auth/request-key (key recovery for verified accounts)
 *
 * Browser / callback flow: opens a local HTTP server that catches the OAuth
 * callback from app.unisonlabs.ai and saves the returned token.
 *
 * Credentials are stored in ~/.codex/unison/credentials.json (mode 0600).
 * UNISON_TOKEN env var always takes precedence.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname, platform, arch } from "node:os";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { openUrl } from "./openUrl.js";

const UNISON_DIR = join(homedir(), ".codex", "unison");
const CREDENTIALS_FILE = join(UNISON_DIR, "credentials.json");

// The Unison app's agent-connect endpoint for browser auth
const AUTH_BASE_URL =
  process.env.UNISON_APP_URL
    ? `${process.env.UNISON_APP_URL.replace(/\/+$/, "")}/auth/agent-connect`
    : "https://app.unisonlabs.ai/auth/agent-connect";

const API_BASE_URL =
  process.env.UNISON_API_URL?.replace(/\/+$/, "") ?? "https://api.unisonlabs.ai";

const AUTH_TIMEOUT = Number(process.env.UNISON_AUTH_TIMEOUT) || 5 * 60_000;

const AUTH_SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Connected - Unison</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100vh;background:#fafafa}
.dot{width:10px;height:10px;background:#22c55e;border-radius:50%;display:inline-block;margin-right:8px}
h1{font-size:32px;font-weight:500;color:#1a1a1a;margin:16px 0}
p{color:#666;font-size:16px}
</style></head><body>
<div><span class="dot"></span><span style="color:#22c55e;font-size:14px">Connected</span></div>
<h1>Unison is ready</h1>
<p>You can close this tab and return to Codex.</p>
</body></html>`;

const AUTH_ERROR_HTML = `<!DOCTYPE html>
<html><head><title>Error - Unison</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100vh;background:#fafafa}
.dot{width:10px;height:10px;background:#ef4444;border-radius:50%;display:inline-block;margin-right:8px}
h1{font-size:32px;font-weight:500;color:#1a1a1a;margin:16px 0}
p{color:#666;font-size:16px}
</style></head><body>
<div><span class="dot"></span><span style="color:#ef4444;font-size:14px">Error</span></div>
<h1>Connection Failed</h1>
<p>Invalid token received. Please try again.</p>
</body></html>`;

export interface Credentials {
  token?: string;
  apiBaseUrl?: string;
  savedAt?: string;
}

export { AUTH_BASE_URL, CREDENTIALS_FILE };

function normalizeApiBaseUrl(apiBaseUrl: string | null | undefined): string | undefined {
  if (!apiBaseUrl) return undefined;
  try {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function loadCredentialData(): Credentials | null {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8")) as Credentials;
    }
  } catch {}
  return null;
}

export function loadCredentials(): string | undefined {
  const data = loadCredentialData();
  if (data?.token) return data.token;
  return undefined;
}

function saveCredentials(token: string, apiBaseUrl?: string): void {
  mkdirSync(UNISON_DIR, { recursive: true, mode: 0o700 });
  const credentials: Credentials = { token, savedAt: new Date().toISOString() };
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  if (normalizedApiBaseUrl) credentials.apiBaseUrl = normalizedApiBaseUrl;
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Headless machine-auth: provision an account for the given email.
 * Returns the unverified API key immediately (valid for 72h, then reaper-eligible).
 * The user must call verifyAccount() with the emailed OTP to make it durable.
 */
export async function provisionAccount(email: string): Promise<{
  apiKey: string;
  tenantId: string;
  status: string;
  emailSent: boolean;
  message: string;
}> {
  const resp = await fetch(`${API_BASE_URL}/v1/auth/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    const code = body?.error?.code ?? "";
    const message = body?.error?.message ?? `HTTP ${resp.status}`;
    throw Object.assign(new Error(message), { code });
  }

  return resp.json() as Promise<{
    apiKey: string;
    tenantId: string;
    status: string;
    emailSent: boolean;
    message: string;
  }>;
}

/**
 * Verify the emailed OTP for the given email.
 * First-time: returns { verified, tenantId }
 * Recovery: returns { verified, apiKey, tenantId }
 */
export async function verifyAccount(email: string, code: string): Promise<{
  verified: boolean;
  apiKey?: string;
  tenantId: string;
}> {
  const resp = await fetch(`${API_BASE_URL}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });

  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body?.error?.message ?? `HTTP ${resp.status}`);
  }

  return resp.json() as Promise<{
    verified: boolean;
    apiKey?: string;
    tenantId: string;
  }>;
}

/**
 * Request a recovery OTP for an existing verified account.
 */
export async function requestKey(email: string): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/v1/auth/request-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
}

/**
 * Browser-based auth flow. Opens a local HTTP server, launches the browser
 * to app.unisonlabs.ai/auth/agent-connect, and waits for the callback with
 * the token. Saves the token to credentials.json on success.
 */
export function startAuthFlow(): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const stateToken = randomBytes(16).toString("hex");

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", "http://localhost");

      if (url.pathname === "/callback") {
        const callbackState = url.searchParams.get("state");
        if (callbackState !== stateToken) {
          res.writeHead(403, { "Content-Type": "text/html" });
          res.end(AUTH_ERROR_HTML);
          return;
        }

        const token =
          url.searchParams.get("token") ||
          url.searchParams.get("apikey") ||
          url.searchParams.get("api_key");
        const apiBaseUrl =
          url.searchParams.get("api_url") || url.searchParams.get("api_base_url");

        if (token?.startsWith("usk_")) {
          saveCredentials(token, apiBaseUrl ?? undefined);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(AUTH_SUCCESS_HTML);
          resolved = true;
          clearTimeout(timer);
          server.close();
          resolve(token);
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(AUTH_ERROR_HTML);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const callbackUrl = `http://127.0.0.1:${port}/callback?state=${stateToken}`;
      const params = new URLSearchParams({
        callback: callbackUrl,
        client: "codex",
        hostname: `codex - ${hostname()}`,
        os: `${platform()}-${arch()}`,
        cwd: process.cwd(),
        cli_version: "1.0.0",
      });
      const authUrl = `${AUTH_BASE_URL}?${params.toString()}`;
      openUrl(authUrl).catch((error) => {
        if (!resolved) {
          clearTimeout(timer);
          server.close();
          reject(new Error(`Failed to open browser: ${(error as Error).message}`));
        }
      });
    });

    server.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timer);
        reject(new Error(`Failed to start auth server: ${err.message}`));
      }
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        server.close();
        reject(new Error("AUTH_TIMEOUT"));
      }
    }, AUTH_TIMEOUT);
  });
}

/**
 * Save a raw token (e.g. from headless provision+verify flow) to credentials.
 */
export function saveToken(token: string): void {
  saveCredentials(token);
}
