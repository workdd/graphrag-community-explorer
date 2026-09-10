// Asking a set of questions in one go, and writing down what each one reached.
//
// Twenty-four questions asked by hand, one at a time, with the answers held in somebody's memory, is
// not an evaluation. Two columns are checkable without any ground truth at all and are worth more
// than an opinion: whether retrieval reached anything, and whether the answer cited any of it. An
// answer with no citations against seventy retrieved records is a finding about the index.
//
// The runners are arguments, so nothing here reaches the network in a test.
import { citedShortIds, countUsage } from "./highlight";
import type { ContextKind, SearchMethod, SearchRun } from "./types";

export interface EvalQuestion {
  id: string;
  question: string;
  method: SearchMethod;
  /** A short name for the row, when the set has one. */
  title?: string;
}

export type EvalStatus = "answered" | "uncited" | "empty" | "failed";

export interface EvalRow {
  id: string;
  title?: string;
  question: string;
  method: SearchMethod;
  status: EvalStatus;
  retrieved: number;
  cited: number;
  byKind: Record<ContextKind, number>;
  llmCalls: number;
  promptTokens: number | null;
  completionTokens: number | null;
  elapsedMs: number;
  error: string | null;
}

/**
 * What a row says without anyone judging the prose.
 *
 * `empty` means retrieval reached nothing, so the model was asked about an empty page: that is the
 * index's problem, not the model's. `uncited` means it was handed evidence and pointed at none of
 * it, which is where an answer stops being checkable.
 */
export function classify(run: SearchRun, retrieved: number, cited: number): EvalStatus {
  if (run.status === "error") return "failed";
  if (retrieved === 0) return "empty";
  return cited === 0 ? "uncited" : "answered";
}

export function rowOf(question: EvalQuestion, run: SearchRun): EvalRow {
  const cited = citedShortIds(run.response, run.context);
  const counts = countUsage(run.context, cited);
  const byKind = {} as Record<ContextKind, number>;
  for (const kind of Object.keys(run.context) as ContextKind[]) byKind[kind] = run.context[kind].length;
  return {
    id: question.id,
    ...(question.title === undefined ? {} : { title: question.title }),
    question: question.question,
    method: question.method,
    status: classify(run, counts.retrieved, counts.cited),
    retrieved: counts.retrieved,
    cited: counts.cited,
    byKind,
    llmCalls: run.stats.llmCalls,
    promptTokens: run.stats.promptTokens,
    completionTokens: run.stats.completionTokens,
    elapsedMs: run.stats.elapsedMs,
    error: run.error,
  };
}

export interface EvalProgress {
  done: number;
  total: number;
  /** The question being asked, so a long run says what it is waiting on. */
  asking: string;
}

export interface EvalInput {
  questions: EvalQuestion[];
  signal?: AbortSignal;
  onProgress?: (progress: EvalProgress) => void;
  /** Called as each one finishes, so the table fills in rather than appearing at the end. */
  onRow?: (row: EvalRow, run: SearchRun) => void;
}

export type EvalRunner = (question: EvalQuestion) => Promise<SearchRun>;

export interface EvalResult {
  rows: EvalRow[];
  runs: SearchRun[];
  stopped: boolean;
}

/**
 * One question at a time, on purpose: a set of two dozen fired at once is a rate limit, and the
 * point is to finish rather than to finish quickly. A question that throws becomes a failed row and
 * the set carries on; one broken question must not cost the other twenty-three.
 */
export async function runSet(input: EvalInput, run: EvalRunner): Promise<EvalResult> {
  const rows: EvalRow[] = [];
  const runs: SearchRun[] = [];
  for (const [index, question] of input.questions.entries()) {
    if (input.signal?.aborted) return { rows, runs, stopped: true };
    input.onProgress?.({ done: index, total: input.questions.length, asking: question.question });
    try {
      const result = await run(question);
      const row = rowOf(question, result);
      rows.push(row);
      runs.push(result);
      input.onRow?.(row, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const row: EvalRow = {
        id: question.id,
        ...(question.title === undefined ? {} : { title: question.title }),
        question: question.question,
        method: question.method,
        status: "failed",
        retrieved: 0,
        cited: 0,
        byKind: {} as Record<ContextKind, number>,
        llmCalls: 0,
        promptTokens: null,
        completionTokens: null,
        elapsedMs: 0,
        error: message,
      };
      rows.push(row);
      input.onRow?.(row, { ...emptyRun(question.method), error: message });
    }
  }
  input.onProgress?.({ done: input.questions.length, total: input.questions.length, asking: "" });
  return { rows, runs, stopped: false };
}

const emptyRun = (method: SearchMethod): SearchRun => ({
  method,
  engine: "explorer",
  status: "error",
  error: null,
  response: "",
  settings: {},
  context: { entities: [], relationships: [], reports: [], sources: [], claims: [] },
  stages: [],
  stats: { elapsedMs: 0, llmCalls: 0, promptTokens: null, completionTokens: null },
  messages: [],
});

export interface EvalSummary {
  asked: number;
  answered: number;
  /** Handed evidence and pointed at none of it. */
  uncited: number;
  /** Retrieval reached nothing at all. */
  empty: number;
  failed: number;
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  elapsedMs: number;
}

export function summarize(rows: EvalRow[]): EvalSummary {
  const count = (status: EvalStatus) => rows.filter((row) => row.status === status).length;
  return {
    asked: rows.length,
    answered: count("answered"),
    uncited: count("uncited"),
    empty: count("empty"),
    failed: count("failed"),
    llmCalls: rows.reduce((sum, row) => sum + row.llmCalls, 0),
    promptTokens: rows.reduce((sum, row) => sum + (row.promptTokens ?? 0), 0),
    completionTokens: rows.reduce((sum, row) => sum + (row.completionTokens ?? 0), 0),
    elapsedMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
  };
}

const COLUMNS = [
  "id",
  "title",
  "method",
  "status",
  "retrieved",
  "cited",
  "entities",
  "relationships",
  "reports",
  "sources",
  "claims",
  "llm_calls",
  "prompt_tokens",
  "completion_tokens",
  "elapsed_ms",
  "question",
  "error",
] as const;

/** A field is quoted when it could otherwise end the field or the row. */
const cell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function evalCsv(rows: EvalRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.title ?? "",
        row.method,
        row.status,
        row.retrieved,
        row.cited,
        row.byKind.entities ?? 0,
        row.byKind.relationships ?? 0,
        row.byKind.reports ?? 0,
        row.byKind.sources ?? 0,
        row.byKind.claims ?? 0,
        row.llmCalls,
        row.promptTokens,
        row.completionTokens,
        row.elapsedMs,
        row.question,
        row.error,
      ].map(cell).join(","),
    );
  }
  return lines.join("\n");
}
