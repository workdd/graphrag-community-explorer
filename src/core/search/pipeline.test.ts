import { describe, expect, it } from "vitest";
import { describeRun } from "./pipeline";
import { emptyContext, type SearchRun } from "./types";

const run = (over: Partial<SearchRun> = {}): SearchRun => ({
  method: "local",
  engine: "explorer",
  status: "ok",
  error: null,
  response: "",
  settings: { topK: 10, tokenBudget: 8000, chatModel: "solar-pro2", embedModel: "embed-1" },
  context: { ...emptyContext(), entities: [{ shortId: "1", title: "A", text: "" }] },
  stages: [{ name: "embed", ms: 120 }, { name: "select", ms: 3 }, { name: "chat", ms: 4000, calls: 1 }],
  stats: { elapsedMs: 4200, llmCalls: 2, promptTokens: 4780, completionTokens: 500 },
  messages: [{ stage: "chat", role: "system", content: "s" }, { stage: "chat", role: "user", content: "u" }],
  ...over,
});

const noCitations = { entities: new Set<string>(), relationships: new Set<string>(), reports: new Set<string>(), sources: new Set<string>(), claims: new Set<string>() };

describe("describeRun for a local run", () => {
  it("walks from the question to the answer", () => {
    const keys = describeRun(run(), noCitations).map((s) => s.key);
    expect(keys).toEqual(["question", "embed", "rank", "expand", "budget", "prompt", "model", "answer"]);
  });

  it("names the embedding model once, on the step that used it", () => {
    const steps = describeRun(run(), noCitations);
    expect(steps.find((s) => s.key === "question")?.detail).toBeNull();
    expect(steps.find((s) => s.key === "embed")?.detail).toBe("embed-1");
  });

  it("reports the measured times, not nominal ones", () => {
    const steps = describeRun(run(), noCitations);
    expect(steps.find((s) => s.key === "embed")?.value).toBe("120ms");
    expect(steps.find((s) => s.key === "model")?.value).toBe("4000ms");
  });

  it("reports the provider's own token count when it gave one", () => {
    expect(describeRun(run(), noCitations).find((s) => s.key === "prompt")?.value).toBe("4780");
  });

  it("marks an estimate as an estimate when the provider reported nothing", () => {
    const r = run({ stats: { elapsedMs: 1, llmCalls: 1, promptTokens: null, completionTokens: null } });
    expect(describeRun(r, noCitations).find((s) => s.key === "prompt")?.value?.startsWith("~")).toBe(true);
  });

  it("counts what the answer cited", () => {
    const cited = { ...noCitations, entities: new Set(["1"]), reports: new Set(["2", "3"]) };
    expect(describeRun(run(), cited).find((s) => s.key === "answer")?.value).toBe("3");
  });

  it("leaves a step blank rather than inventing a figure", () => {
    const r = run({ stages: [] });
    expect(describeRun(r, noCitations).find((s) => s.key === "embed")?.value).toBeNull();
  });
});

describe("describeRun for a global run", () => {
  const g = run({
    method: "global",
    settings: { level: 2, batchTokens: 6000, chatModel: "solar-pro2" },
    context: { ...emptyContext(), reports: [{ shortId: "1", title: "R", text: "" }] },
    stages: [{ name: "collect", ms: 1 }, { name: "map", ms: 3500, calls: 4 }, { name: "reduce", ms: 900, calls: 1 }],
  });

  it("walks the map and reduce path instead of the ranking one", () => {
    expect(describeRun(g, noCitations).map((s) => s.key)).toEqual(
      ["question", "collect", "batch", "map", "prompt", "reduce", "answer"],
    );
  });

  it("shows how many calls the batching cost", () => {
    expect(describeRun(g, noCitations).find((s) => s.key === "batch")?.value).toBe("4");
  });

  it("names the level the summaries came from", () => {
    expect(describeRun(g, noCitations).find((s) => s.key === "collect")?.detail).toBe("level 2");
  });
});
