import { isConfigured, validateCustomTag } from "../config.js";
import { UnisonBrainClient } from "../services/client.js";
import { getProjectTag, getUserTag } from "../services/tags.js";

function parseArgs(args: string[]): { content: string; customTag?: string } {
  let customTag: string | undefined;
  const contentParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && i + 1 < args.length) {
      customTag = args[++i];
    } else {
      contentParts.push(args[i]);
    }
  }

  return { content: contentParts.join(" "), customTag };
}

async function main(): Promise<void> {
  if (!isConfigured()) {
    console.error(
      "Unison is not authenticated.\n" +
      "Run /unison-login to connect, or set UNISON_TOKEN in your shell profile."
    );
    process.exit(1);
  }

  const { content, customTag } = parseArgs(process.argv.slice(2));

  if (!content.trim()) {
    console.log(
      'No content provided. Usage: node forget-memory.js [--tag <tag>] "content to forget"'
    );
    process.exit(0);
  }

  const client = new UnisonBrainClient();

  if (customTag) {
    const validationError = validateCustomTag(customTag);
    if (validationError) {
      console.log(validationError);
      process.exit(1);
    }
  }

  try {
    if (customTag) {
      const result = await client.forgetMemory(content, customTag);
      if (result.success) {
        console.log(`Memory forgotten from tag '${customTag}'${result.path ? ` (path: ${result.path})` : ""}`);
      } else {
        console.log(`Failed to forget memory from tag '${customTag}': ${result.error}`);
      }
    } else {
      const projectTag = getProjectTag(process.cwd());
      const userTag = getUserTag();

      const [projectResult, userResult] = await Promise.all([
        client.forgetMemory(content, projectTag),
        client.forgetMemory(content, userTag),
      ]);

      const forgotten: string[] = [];
      const errors: string[] = [];

      if (projectResult.success) {
        forgotten.push(projectResult.path ? `project (path: ${projectResult.path})` : "project");
      } else {
        errors.push(`project: ${projectResult.error}`);
      }

      if (userResult.success) {
        forgotten.push(userResult.path ? `user (path: ${userResult.path})` : "user");
      } else {
        errors.push(`user: ${userResult.error}`);
      }

      if (forgotten.length > 0) {
        console.log(`Memory forgotten from: ${forgotten.join(", ")}`);
      } else {
        console.log(`Failed to forget memory: ${errors.join("; ")}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Failed to forget memory: ${message}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`Failed to forget memory: ${message}`);
});
