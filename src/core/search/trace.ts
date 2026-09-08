// Reading a trace someone else produced. Fields we do not know are carried through rather than
// dropped, so a file written by a newer runner still opens and still shows what it holds.
import { emptyContext, TRACE_SCHEMA_VERSION, type ContextItem, type ContextKind, type SearchContext, type SearchRun, type SearchTrace } from "./types";

export class TraceError extends Error {}

const KINDS: ContextKind[] = ["entities", "relationships", "reports", "sources", "claims"];

const major = (version: string): string => version.split(".")[0] ?? "";

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const text = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

function readItems(raw: unknown, notes: string[], where: string): ContextItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextItem[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    const shortId = text(row.shortId);
    if (shortId === "") {
      notes.push(`An item in ${where} has no number and cannot be cited.`);
      continue;
    }
    out.push({
      id: typeof row.id === "string" ? row.id : undefined,
      shortId,
      title: text(row.title, shortId),
      text: text(row.text),
      score: typeof row.score === "number" ? row.score : undefined,
      tokens: typeof row.tokens === "number" ? row.tokens : undefined,
      raw: row.raw === undefined ? undefined : asRecord(row.raw),
    });
  }
  return out;
}

function readContext(raw: unknown, notes: string[]): SearchContext {
  const source = asRecord(raw);
  const context = emptyContext();
  for (const kind of KINDS) context[kind] = readItems(source[kind], notes, kind);
  for (const key of Object.keys(source)) {
    if (!KINDS.includes(key as ContextKind)) notes.push(`The file carries a context group this version does not draw: ${key}.`);
  }
  return context;
}

function readRun(raw: unknown, notes: string[]): SearchRun {
  const row = asRecord(raw);
  const method = row.method === "global" ? "global" : "local";
  if (row.method !== "local" && row.method !== "global") {
    notes.push(`A run names the method "${text(row.method, "?")}", which this version reads as local.`);
  }
  const stats = asRecord(row.stats);
  const number = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    method,
    engine: text(row.engine, "unknown"),
    status: row.status === "error" ? "error" : "ok",
    error: typeof row.error === "string" ? row.error : null,
    response: text(row.response),
    settings: asRecord(row.settings) as SearchRun["settings"],
    context: readContext(row.context, notes),
    stages: Array.isArray(row.stages)
      ? row.stages.map((s) => {
          const stage = asRecord(s);
          return { name: text(stage.name, "?"), ms: number(stage.ms) ?? 0, calls: number(stage.calls) ?? undefined };
        })
      : [],
    stats: {
      elapsedMs: number(stats.elapsedMs) ?? 0,
      llmCalls: number(stats.llmCalls) ?? 0,
      promptTokens: number(stats.promptTokens),
      completionTokens: number(stats.completionTokens),
    },
  };
}

export interface TraceLoad {
  trace: SearchTrace;
  notes: string[];
}

export function parseTrace(input: unknown): TraceLoad {
  const root = asRecord(input);
  const version = text(root.schemaVersion);
  if (version === "") throw new TraceError("The file does not say which trace schema it uses.");
  if (major(version) !== major(TRACE_SCHEMA_VERSION)) {
    throw new TraceError(`This version reads trace schema ${major(TRACE_SCHEMA_VERSION)}.x, the file says ${version}.`);
  }
  if (!Array.isArray(root.runs)) throw new TraceError("The file has no runs.");

  const notes: string[] = [];
  const producer = asRecord(root.producer);
  const index = asRecord(root.index);
  const files: Record<string, string> = {};
  for (const [name, digest] of Object.entries(asRecord(index.files))) {
    if (typeof digest === "string") files[name] = digest;
  }
  return {
    trace: {
      schemaVersion: version,
      producer: { tool: text(producer.tool, "unknown"), version: text(producer.version, "unknown") },
      createdAt: text(root.createdAt),
      index: { label: text(index.label, "unknown"), files },
      query: text(root.query),
      runs: root.runs.map((run) => readRun(run, notes)),
    },
    notes,
  };
}

export function parseTraceJson(json: string): TraceLoad {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new TraceError(`The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseTrace(parsed);
}

export const traceJson = (trace: SearchTrace): string => JSON.stringify(trace, null, 2);
