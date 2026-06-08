import { CONFIG, isConfigured, validateCustomTag } from "../config.js";
import { UnisonBrainClient, type SearchResponse } from "../services/client.js";
import { formatContextForPrompt } from "../services/context.js";
import { getProjectTag, getUserTag } from "../services/tags.js";

type Scope = "user" | "project" | "both" | "custom";

interface ParsedArgs {
  scope: Scope;
  includeProfile: boolean;
  query: string;
  customTag?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  let scope: Scope = "both";
  let includeProfile = true;
  let customTag: string | undefined;
  const queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user") {
      scope = "user";
    } else if (args[i] === "--project") {
      scope = "project";
    } else if (args[i] === "--both") {
      scope = "both";
    } else if (args[i] === "--no-profile") {
      includeProfile = false;
    } else if (args[i] === "--tag" && i + 1 < args.length) {
      customTag = args[++i];
      scope = "custom";
    } else {
      queryParts.push(args[i]);
    }
  }

  return { scope, includeProfile, query: queryParts.join(" "), customTag };
}

async function main(): Promise<void> {
  if (!isConfigured()) {
    console.error(
      "Unison is not authenticated.\n" +
      "Run /unison-login to connect, or set UNISON_TOKEN in your shell profile."
    );
    process.exit(1);
  }

  const { scope, includeProfile, query, customTag } = parseArgs(process.argv.slice(2));

  if (!query.trim()) {
    console.log(
      'No search query provided. Usage: node search-memory.js [--user|--project|--both|--tag <tag>] "query"'
    );
    process.exit(0);
  }

  const client = new UnisonBrainClient();
  const userTag = getUserTag();
  const projectTag = getProjectTag(process.cwd());

  if (customTag) {
    const validationError = validateCustomTag(customTag);
    if (validationError) {
      console.log(validationError);
      process.exit(1);
    }
  }

  try {
    let searchResult: SearchResponse;

    if (scope === "custom" && customTag) {
      searchResult = await client.searchBrain(query, {
        limit: CONFIG.maxMemories,
        tags: [customTag],
      });

      if (!searchResult.success) {
        console.log(`Failed to search tag '${customTag}': ${searchResult.error}`);
        return;
      }
    } else if (scope === "both") {
      const [userResult, projectResult] = await Promise.all([
        client.searchBrain(query, { limit: CONFIG.maxMemories, tags: [userTag] }),
        client.searchBrain(query, { limit: CONFIG.maxMemories, tags: [projectTag] }),
      ]);

      if (!userResult.success && !projectResult.success) {
        console.log(`Failed to search memories: ${userResult.error}`);
        return;
      }

      const combinedResults = [
        ...(userResult.success ? userResult.results ?? [] : []),
        ...(projectResult.success ? projectResult.results ?? [] : []),
      ];

      searchResult = {
        success: true,
        results: combinedResults,
        total: combinedResults.length,
      };
    } else {
      const tag = scope === "user" ? userTag : projectTag;
      searchResult = await client.searchBrain(query, {
        limit: CONFIG.maxMemories,
        tags: [tag],
      });

      if (!searchResult.success) {
        console.log(`Failed to search memories: ${searchResult.error}`);
        return;
      }
    }

    const profileResult = includeProfile
      ? await client.getProfile(userTag, query)
      : { success: false as const, profile: null };

    const output = formatContextForPrompt(
      searchResult,
      profileResult,
      CONFIG.maxMemories,
      CONFIG.maxProfileItems,
    );

    if (output.trim()) {
      console.log(output);
    } else {
      console.log(`No memories found for "${query}"`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Failed to search memories: ${message}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`Failed to search memories: ${message}`);
});
