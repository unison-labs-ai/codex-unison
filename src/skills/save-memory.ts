import { isConfigured, validateCustomTag } from "../config.js";
import { UnisonBrainClient } from "../services/client.js";
import { getProjectName, getProjectTag } from "../services/tags.js";

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
    console.log('No content provided. Usage: node save-memory.js [--tag <tag>] "content to save"');
    process.exit(0);
  }

  if (customTag) {
    const validationError = validateCustomTag(customTag);
    if (validationError) {
      console.log(validationError);
      process.exit(1);
    }
  }

  const client = new UnisonBrainClient();
  const projectTag = getProjectTag(process.cwd());
  const projectName = getProjectName(process.cwd());
  const effectiveTag = customTag || projectTag;

  try {
    const metadata = {
      type: "project-knowledge",
      source: "skill",
      project: projectName,
      timestamp: new Date().toISOString(),
    };

    const result = await client.addMemory(content, effectiveTag, metadata);

    if (result.success) {
      const tagLabel = customTag ? `tag '${customTag}'` : `project '${effectiveTag}'`;
      console.log(`Memory saved (path: ${result.path}) to ${tagLabel}`);
    } else {
      console.log(`Failed to save memory: ${result.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Failed to save memory: ${message}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`Failed to save memory: ${message}`);
});
