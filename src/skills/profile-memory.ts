#!/usr/bin/env node
import { isConfigured } from "../config.js";
import { UnisonBrainClient } from "../services/client.js";
import { getTags } from "../services/tags.js";

async function main() {
  if (!isConfigured()) {
    console.error("Unison is not authenticated. Run /unison-login first.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const tags = getTags(cwd);
  const client = new UnisonBrainClient();
  const result = await client.getProfile(tags.user);

  if (!result.success || !result.profile) {
    console.log("No profile available yet.");
    process.exit(0);
  }

  const staticFacts = result.profile.static ?? [];
  const dynamicFacts = result.profile.dynamic ?? [];
  const lines: string[] = [];

  if (staticFacts.length > 0) {
    lines.push("[User Profile — Stable]");
    staticFacts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  }
  if (dynamicFacts.length > 0) {
    lines.push("[User Profile — Recent]");
    dynamicFacts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  }

  if (lines.length === 0) {
    console.log("Profile is empty.");
    process.exit(0);
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
