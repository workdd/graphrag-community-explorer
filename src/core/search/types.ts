// The record of one search run. Produced by the in-browser engines and by exported files, read by
// the search view. Direct runs and imported files are drawn by the same code.

export type SearchMethod = "local" | "global";

/** "explorer" is this app. Anything else came from a runner we do not control. */
export type SearchEngine = "explorer" | string;

export type ContextKind = "entities" | "relationships" | "reports" | "sources" | "claims";

export interface ContextItem {
  /** Record id in the loaded dataset, when the engine knew it. */
  id?: string;
  /** Number the answer cites. Assigned per kind while the context is assembled. */
  shortId: string;
  title: string;
  /** Text that went into the prompt. */
  text: string;
  /** Similarity, rank or weight, depending on kind. Absent when the engine did not score. */
  score?: number;
  tokens?: number;
  /** Source row kept whole so a newer index shape is still readable. */
  raw?: Record<string, unknown>;
}

export type SearchContext = Record<ContextKind, ContextItem[]>;

export interface RunStage {
  name: string;
  ms: number;
  /** Calls this stage made, when it made any. */
  calls?: number;
}

export interface RunStats {
  elapsedMs: number;
  llmCalls: number;
  /** From the provider's usage field. null when the provider did not report it. */
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface SentMessage {
  /** Which call this went to: "chat", "map" or "reduce". */
  stage: string;
  role: "system" | "user";
  content: string;
}

export interface SearchRun {
  method: SearchMethod;
  engine: SearchEngine;
  status: "ok" | "error";
  error: string | null;
  response: string;
  /** Whitelisted settings only. Never the key or the base URL. */
  settings: Record<string, string | number | boolean>;
  context: SearchContext;
  stages: RunStage[];
  stats: RunStats;
  /** Exactly what was sent, so the prompt is inspectable rather than described. */
  messages: SentMessage[];
}

export interface TraceIndex {
  label: string;
  /** File name to sha256 of the bytes that were loaded. */
  files: Record<string, string>;
}

export interface SearchTrace {
  schemaVersion: string;
  producer: { tool: string; version: string };
  createdAt: string;
  index: TraceIndex;
  query: string;
  runs: SearchRun[];
}

export const TRACE_SCHEMA_VERSION = "1.0";

export const emptyContext = (): SearchContext => ({
  entities: [],
  relationships: [],
  reports: [],
  sources: [],
  claims: [],
});
