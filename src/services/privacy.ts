export function stripPrivateContent(content: string): string {
  return content.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]");
}

export function cleanContent(content: string): string {
  return content
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replace(/<unison-context>[\s\S]*?<\/unison-context>/gi, "")
    .trim();
}
