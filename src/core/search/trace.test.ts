import { describe, expect, it } from "vitest";
import { parseTrace, parseTraceJson, TraceError, traceJson } from "./trace";
import { emptyContext, type SearchTrace } from "./types";

const trace = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "1.0",
  producer: { tool: "explorer", version: "0.3.0" },
  createdAt: "2026-09-08T00:00:00.000Z",
  index: { label: "age", files: { "entities.parquet": "sha256:aa" } },
  query: "q",
  runs: [
    {
      method: "local",
      engine: "explorer",
      status: "ok",
      error: null,
      response: "answer",
      settings: { chatModel: "c" },
      context: { entities: [{ id: "e1", shortId: "1", title: "Alpha", text: "t" }] },
      stages: [{ name: "chat", ms: 10, calls: 1 }],
      stats: { elapsedMs: 10, llmCalls: 1, promptTokens: 5, completionTokens: null },
    },
  ],
  ...over,
});

describe("parseTrace", () => {
  it("reads a well formed file", () => {
    const { trace: parsed, notes } = parseTrace(trace());
    expect(parsed.query).toBe("q");
    expect(parsed.index.files).toEqual({ "entities.parquet": "sha256:aa" });
    expect(parsed.runs[0].context.entities[0].title).toBe("Alpha");
    expect(notes).toEqual([]);
  });

  it("keeps a null token count as null", () => {
    expect(parseTrace(trace()).trace.runs[0].stats.completionTokens).toBeNull();
  });

  it("fills the context groups the file left out", () => {
    const { trace: parsed } = parseTrace(trace());
    expect(Object.keys(parsed.runs[0].context).sort()).toEqual(Object.keys(emptyContext()).sort());
    expect(parsed.runs[0].context.reports).toEqual([]);
  });

  it("refuses a file with no schema version", () => {
    expect(() => parseTrace(trace({ schemaVersion: undefined }))).toThrow(TraceError);
  });

  it("refuses a schema from another major version", () => {
    expect(() => parseTrace(trace({ schemaVersion: "2.0" }))).toThrow(/reads trace schema 1/);
  });

  it("refuses a file with no runs", () => {
    expect(() => parseTrace(trace({ runs: undefined }))).toThrow(/no runs/);
  });

  it("notes a context group it cannot draw instead of dropping the file", () => {
    const raw = trace();
    (raw.runs[0].context as Record<string, unknown>).widgets = [];
    expect(parseTrace(raw).notes.join(" ")).toMatch(/widgets/);
  });

  it("notes an unknown method and reads it as local", () => {
    const raw = trace();
    (raw.runs[0] as Record<string, unknown>).method = "drift";
    const { trace: parsed, notes } = parseTrace(raw);
    expect(parsed.runs[0].method).toBe("local");
    expect(notes.join(" ")).toMatch(/drift/);
  });

  it("skips a context item with no number", () => {
    const raw = trace();
    (raw.runs[0].context as Record<string, unknown>).entities = [{ id: "e1", title: "no number" }];
    const { trace: parsed, notes } = parseTrace(raw);
    expect(parsed.runs[0].context.entities).toEqual([]);
    expect(notes.join(" ")).toMatch(/cannot be cited/);
  });

  it("marks an engine it does not know rather than claiming it is ours", () => {
    const raw = trace();
    (raw.runs[0] as Record<string, unknown>).engine = undefined;
    expect(parseTrace(raw).trace.runs[0].engine).toBe("unknown");
  });
});

describe("parseTraceJson and traceJson", () => {
  it("round trips", () => {
    const parsed = parseTraceJson(traceJson(parseTrace(trace()).trace as SearchTrace));
    expect(parsed.trace.runs[0].response).toBe("answer");
  });

  it("says plainly when the file is not JSON", () => {
    expect(() => parseTraceJson("{oops")).toThrow(/not valid JSON/);
  });
});
