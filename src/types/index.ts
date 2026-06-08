export type MemoryKind =
  | "project-config"
  | "architecture"
  | "error-solution"
  | "preference"
  | "learned-pattern"
  | "conversation"
  | "project-knowledge";

export type ConversationRole = "user" | "assistant" | "system" | "tool";

export type ConversationContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; imageUrl: { url: string } };

export interface ConversationMessage {
  role: ConversationRole;
  content: string | ConversationContentPart[];
  name?: string;
}

export interface BrainSearchResult {
  doc?: {
    path?: string;
    title?: string;
    tldr?: string;
    tags?: string[];
    kind?: string;
  };
  score?: number;
  highlight?: string;
  sources?: string[];
}

export interface BrainDocument {
  path: string;
  title?: string;
  tldr?: string;
  bodyMd?: string;
  tags?: string[];
  kind?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrainStatus {
  docCount: number;
  docWithEmbedding: number;
  entityCount: number;
  factCount: number;
  lastIngestAt?: string;
  pendingJobs: number;
  staleWikiPageCount: number;
}

export interface WhoAmIResponse {
  user: { id: string; email: string };
  tenant: { id: string; name: string; verified: boolean };
  scopes: string[];
}
