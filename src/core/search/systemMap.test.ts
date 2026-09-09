import { describe, expect, it } from "vitest";
import type { Community, Dataset, Partition } from "../model";
import { describeSystem, leavingFlows, modelCalls, type SystemInput } from "./systemMap";
import { emptyContext, type SearchRun } from "./types";

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([["a", { id: "a", title: "A", type: "T", degree: 1, textUnitIds: [] }]]),
  relationships: [{ id: "r", sourceId: "a", targetId: "a", type: "calls", textUnitIds: [] }],
  partitions: [], textUnits: new Map(), documents: new Map(), covariates: [],
};
const community: Community = {
  id: "k", level: 0, parentId: null, childIds: [], title: "K", entityIds: [], relationshipIds: [],
  size: 1, membershipSource: "entity_ids", textUnitIds: [], report: { summary: "s", findings: [] },
};
const partition: Partition = { id: "p", label: "p", levels: [0], rootLevel: 0, communities: new Map([["k", community]]) };
const embeddings = { model: "embed-1", dim: 8, sourceFiles: {}, vectors: new Map([["a", Float32Array.from([1])]]) };

const run: SearchRun = {
  method: "local", engine: "explorer", status: "ok", error: null, response: "",
  settings: { tokenBudget: 8000 },
  context: { ...emptyContext(), entities: [{ shortId: "1", title: "A", text: "" }] },
  stages: [{ name: "embed", ms: 120 }, { name: "chat", ms: 4000 }],
  stats: { elapsedMs: 1, llmCalls: 2, promptTokens: 4780, completionTokens: 500 },
  messages: [],
};

const input: SystemInput = { dataset, partition, embeddings, method: "local", run };

describe("describeSystem for local", () => {
  it("walks retrieval, context, the model call and the response", () => {
    const zones = describeSystem(input).nodes.map((n) => n.zone);
    expect(new Set(zones)).toEqual(new Set(["retrieval", "context", "model", "response"]));
  });

  it("marks the one call that carries the evidence out", () => {
    const leaving = leavingFlows(describeSystem(input));
    expect(leaving.map((f) => f.to)).toEqual(["chatCall"]);
    expect(leaving[0].label).toBe("the evidence text");
  });

  it("names the calls a run pays for", () => {
    expect(modelCalls(describeSystem(input)).map((n) => n.id)).toEqual(["embedCall", "chatCall"]);
  });

  it("uses the provider's own prompt token count", () => {
    expect(describeSystem(input).nodes.find((n) => n.id === "prompt")?.value).toBe("4,780");
  });

  it("marks an estimate when the provider counted nothing", () => {
    const r = { ...run, stats: { ...run.stats, promptTokens: null }, messages: [{ stage: "chat" as const, role: "user" as const, content: "abcd abcd" }] };
    expect(describeSystem({ ...input, run: r }).nodes.find((n) => n.id === "prompt")?.value?.startsWith("~")).toBe(true);
  });

  it("says the sidecar is missing rather than naming a model that was never used", () => {
    const node = describeSystem({ ...input, embeddings: undefined }).nodes.find((n) => n.id === "embedCall");
    expect(node?.note).toBe("needs the sidecar");
    expect(node?.noteVars).toBeUndefined();
  });

  it("draws the shape with empty figures before anything is asked", () => {
    const nodes = describeSystem({ ...input, run: null }).nodes;
    expect(nodes.find((n) => n.id === "vector")?.value).toBeNull();
    // The model name is a placeholder value now, so the note can be translated.
    expect(nodes.find((n) => n.id === "embedCall")?.noteVars).toEqual({ model: "embed-1", dim: "8" });
  });
});

describe("describeSystem for global", () => {
  const g: SystemInput = {
    ...input,
    method: "global",
    run: { ...run, method: "global", stages: [{ name: "map", ms: 3500, calls: 4 }, { name: "reduce", ms: 900 }] },
  };

  it("has no cosine step, because global ranks nothing", () => {
    expect(describeSystem(g).nodes.some((n) => n.id === "vector")).toBe(false);
  });

  it("shows both completions and what each one carries out", () => {
    const leaving = leavingFlows(describeSystem(g));
    expect(leaving.map((f) => f.to)).toEqual(["mapCall", "reduceCall"]);
    expect(leaving[0].label).toBe("every summary");
  });

  it("reports how many batches the run actually made", () => {
    expect(describeSystem(g).nodes.find((n) => n.id === "batch")?.value).toBe("4");
  });

  it("counts both completions as calls", () => {
    expect(modelCalls(describeSystem(g))).toHaveLength(2);
  });
});
