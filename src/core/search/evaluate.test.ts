import { describe, expect, it, vi } from "vitest";
import { classify, evalCsv, rowOf, runSet, summarize, type EvalQuestion, type EvalRunner } from "./evaluate";
import { emptyContext, type ContextItem, type SearchRun } from "./types";

const item = (shortId: string): ContextItem => ({ id: `id${shortId}`, shortId, title: `T${shortId}`, text: "t" });

const run = (over: Partial<SearchRun> = {}): SearchRun => ({
  method: "local",
  engine: "explorer",
  status: "ok",
  error: null,
  response: "",
  settings: {},
  context: emptyContext(),
  stages: [],
  stats: { elapsedMs: 100, llmCalls: 2, promptTokens: 300, completionTokens: 50 },
  messages: [],
  ...over,
});

const asked = (id: string, method: EvalQuestion["method"] = "local"): EvalQuestion => ({
  id,
  question: `question ${id}`,
  method,
});

describe("what a row says without anyone reading the prose", () => {
  it("calls it answered when evidence went in and some of it came back cited", () => {
    const context = { ...emptyContext(), entities: [item("1"), item("2")] };
    const row = rowOf(asked("a"), run({ context, response: "Because of [Data: Entities (1)]." }));
    expect(row).toMatchObject({ status: "answered", retrieved: 2, cited: 1 });
  });

  it("calls it uncited when the model was handed evidence and pointed at none of it", () => {
    const context = { ...emptyContext(), entities: [item("1"), item("2")] };
    const row = rowOf(asked("a"), run({ context, response: "Something, with no citation at all." }));
    expect(row).toMatchObject({ status: "uncited", retrieved: 2, cited: 0 });
  });

  it("calls it empty when retrieval reached nothing, which is the index's problem", () => {
    expect(rowOf(asked("a"), run({ response: "I have no information." })).status).toBe("empty");
  });

  it("calls it failed when the run itself failed", () => {
    expect(classify(run({ status: "error" }), 10, 3)).toBe("failed");
  });

  it("records what each kind contributed and what it cost", () => {
    const context = { ...emptyContext(), entities: [item("1")], reports: [item("1"), item("2")] };
    const row = rowOf(asked("a"), run({ context, response: "[Data: Reports (1, 2)]" }));
    expect(row.byKind).toMatchObject({ entities: 1, reports: 2, relationships: 0 });
    expect(row).toMatchObject({ llmCalls: 2, promptTokens: 300, completionTokens: 50, elapsedMs: 100 });
  });
});

describe("running a set", () => {
  it("asks every question and keeps every run", async () => {
    const runner: EvalRunner = async (q) => run({ context: { ...emptyContext(), entities: [item("1")] }, response: `[Data: Entities (1)] for ${q.id}` });
    const result = await runSet({ questions: [asked("a"), asked("b"), asked("c")] }, runner);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.runs).toHaveLength(3);
    expect(result.stopped).toBe(false);
  });

  it("asks one at a time, because a set fired at once is a rate limit", async () => {
    let inFlight = 0;
    let most = 0;
    const runner: EvalRunner = async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return run();
    };
    await runSet({ questions: [asked("a"), asked("b"), asked("c")] }, runner);
    expect(most).toBe(1);
  });

  it("does not let one broken question cost the rest", async () => {
    const runner: EvalRunner = async (q) => {
      if (q.id === "b") throw new Error("rate limited");
      return run({ context: { ...emptyContext(), entities: [item("1")] }, response: "[Data: Entities (1)]" });
    };
    const result = await runSet({ questions: [asked("a"), asked("b"), asked("c")] }, runner);
    expect(result.rows.map((r) => r.status)).toEqual(["answered", "failed", "answered"]);
    expect(result.rows[1].error).toBe("rate limited");
  });

  it("stops when asked, and keeps what it already asked", async () => {
    const controller = new AbortController();
    let asks = 0;
    const runner: EvalRunner = async () => {
      asks += 1;
      if (asks === 2) controller.abort();
      return run();
    };
    const result = await runSet(
      { questions: [asked("a"), asked("b"), asked("c"), asked("d")], signal: controller.signal },
      runner,
    );
    expect(result.stopped).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it("reports each row as it lands rather than at the end", async () => {
    const seen: string[] = [];
    await runSet({ questions: [asked("a"), asked("b")], onRow: (row) => seen.push(row.id) }, async () => run());
    expect(seen).toEqual(["a", "b"]);
  });

  it("says what it is waiting on while it waits", async () => {
    const asking: string[] = [];
    await runSet({ questions: [asked("a"), asked("b")], onProgress: (p) => asking.push(p.asking) }, async () => run());
    expect(asking.slice(0, 2)).toEqual(["question a", "question b"]);
  });

  it("asks nothing when the set is empty", async () => {
    const runner = vi.fn();
    const result = await runSet({ questions: [] }, runner as unknown as EvalRunner);
    expect(runner).not.toHaveBeenCalled();
    expect(result.rows).toEqual([]);
  });
});

describe("the summary of a set", () => {
  it("counts each kind of outcome and totals the cost", () => {
    const context = { ...emptyContext(), entities: [item("1")] };
    const rows = [
      rowOf(asked("a"), run({ context, response: "[Data: Entities (1)]" })),
      rowOf(asked("b"), run({ context, response: "no citation" })),
      rowOf(asked("c"), run({ response: "nothing retrieved" })),
      rowOf(asked("d"), run({ status: "error", error: "boom" })),
    ];
    expect(summarize(rows)).toMatchObject({
      asked: 4,
      answered: 1,
      uncited: 1,
      empty: 1,
      failed: 1,
      llmCalls: 8,
      promptTokens: 1200,
    });
  });
});

describe("the CSV", () => {
  it("has a header and one line a row", () => {
    const rows = [rowOf(asked("a"), run({ context: { ...emptyContext(), entities: [item("1")] }, response: "[Data: Entities (1)]" }))];
    const lines = evalCsv(rows).split("\n");
    expect(lines[0]).toContain("id,title,method,status,retrieved,cited");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("answered");
  });

  it("quotes a field that would otherwise end the field or the row", () => {
    const question: EvalQuestion = { id: "a", method: "local", question: 'What of "A, B" and\nC?' };
    const csv = evalCsv([rowOf(question, run())]);
    expect(csv).toContain('"What of ""A, B"" and\nC?"');
    // The header plus one row: the newline inside the quoted field does not start a new record.
    expect(csv.split("\n")).toHaveLength(3); // the embedded newline is inside the quotes
  });

  it("writes an absent token count as empty rather than as null", () => {
    const csv = evalCsv([rowOf(asked("a"), run({ stats: { elapsedMs: 1, llmCalls: 1, promptTokens: null, completionTokens: null } }))]);
    expect(csv).not.toContain("null");
  });
});
