import { describe, expect, it } from "vitest";
import type { Community, Dataset, Partition } from "../model";
import { describeSystem, leavingFlows, type SystemInput } from "./systemMap";
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
  it("puts the files, the browser steps and the provider in their own zones", () => {
    const zones = new Set(describeSystem(input).nodes.map((n) => n.zone));
    expect(zones).toEqual(new Set(["offline", "files", "browser", "provider"]));
  });

  it("marks exactly the two flows that leave the browser", () => {
    const leaving = leavingFlows(describeSystem(input));
    expect(leaving.map((f) => f.to)).toEqual(["embedApi", "chatApi"]);
    expect(leaving.every((f) => f.label !== null)).toBe(true);
  });

  it("carries the measured figures onto the parts that produced them", () => {
    const nodes = describeSystem(input).nodes;
    expect(nodes.find((n) => n.id === "prompt")?.value).toBe("4,780");
    expect(nodes.find((n) => n.id === "embedApi")?.value).toBe("120ms");
    expect(nodes.find((n) => n.id === "vectors")?.value).toBe("1 × 8");
  });

  it("draws the shape with empty figures before anything has been asked", () => {
    const nodes = describeSystem({ ...input, run: null }).nodes;
    expect(nodes.find((n) => n.id === "rank")?.value).toBeNull();
    expect(nodes.find((n) => n.id === "entities")?.value).toBe("1");
  });

  it("leaves the vector file blank when no sidecar was loaded", () => {
    const nodes = describeSystem({ ...input, embeddings: undefined }).nodes;
    expect(nodes.find((n) => n.id === "vectors")?.value).toBeNull();
  });

  it("counts only the communities that carry a summary", () => {
    const bare: Partition = { ...partition, communities: new Map([["k", { ...community, report: undefined }]]) };
    expect(describeSystem({ ...input, partition: bare }).nodes.find((n) => n.id === "reports")?.value).toBe("0");
  });
});

describe("describeSystem for global", () => {
  const g: SystemInput = {
    ...input,
    method: "global",
    run: { ...run, method: "global", stages: [{ name: "map", ms: 3500, calls: 4 }, { name: "reduce", ms: 900 }] },
  };

  it("has no ranking step, because global does not rank entities", () => {
    expect(describeSystem(g).nodes.some((n) => n.id === "rank")).toBe(false);
  });

  it("shows both calls leaving the browser and says what each carries", () => {
    const leaving = leavingFlows(describeSystem(g));
    expect(leaving.map((f) => f.to)).toEqual(["mapApi", "reduceApi"]);
    expect(leaving[0].label).toBe("every summary at the level");
  });

  it("reports how many batches the run actually made", () => {
    expect(describeSystem(g).nodes.find((n) => n.id === "batch")?.value).toBe("4");
  });
});
