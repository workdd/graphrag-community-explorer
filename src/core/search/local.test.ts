import { describe, expect, it } from "vitest";
import type { Community, Dataset, Partition } from "../model";
import type { EmbeddingIndex } from "../loaders/embeddings";
import { buildLocalContext, cosine, DEFAULT_LOCAL, rankEntities, type Seed } from "./local";

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([
    ["a", { id: "a", title: "Alpha", type: "Service", description: "Alpha serves carts.", degree: 2, textUnitIds: ["u1"] }],
    ["b", { id: "b", title: "Beta", type: "Service", description: "Beta stores orders.", degree: 2, textUnitIds: ["u2"] }],
    ["c", { id: "c", title: "Gamma", type: "Team", description: "Gamma owns Beta.", degree: 1, textUnitIds: [] }],
  ]),
  relationships: [
    { id: "r1", sourceId: "a", targetId: "b", type: "calls", weight: 5, description: "Alpha calls Beta.", textUnitIds: [] },
    { id: "r2", sourceId: "c", targetId: "b", type: "owns", weight: 1, description: "Gamma owns Beta.", textUnitIds: [] },
  ],
  partitions: [],
  textUnits: new Map([
    ["u1", { id: "u1", text: "Alpha is the cart service.", documentIds: ["d1"], entityIds: ["a"], relationshipIds: [] }],
    ["u2", { id: "u2", text: "Beta is the order store.", documentIds: ["d1"], entityIds: ["b"], relationshipIds: [] }],
  ]),
  documents: new Map([["d1", { id: "d1", title: "Notes" }]]),
  covariates: [
    { id: "cl1", type: "incident", description: "Alpha timed out.", subjectId: "a", subjectTitle: "Alpha" },
  ],
};

const community: Community = {
  id: "k1", level: 0, parentId: null, childIds: [], title: "Checkout", entityIds: ["a", "b"],
  relationshipIds: ["r1"], size: 2, membershipSource: "entity_ids", textUnitIds: [],
  report: { summary: "Checkout groups Alpha and Beta.", findings: [], rank: 4 },
};
const partition: Partition = { id: "p", label: "p", communities: new Map([["k1", community]]), levels: [0], rootLevel: 0 };

const index: EmbeddingIndex = {
  model: "embed-1",
  dim: 2,
  sourceFiles: {},
  vectors: new Map([
    ["a", Float32Array.from([1, 0])],
    ["b", Float32Array.from([0.8, 0.6])],
    ["c", Float32Array.from([0, 1])],
    ["ghost", Float32Array.from([1, 0])],
  ]),
};

describe("cosine", () => {
  it("is one for the same direction", () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([2, 0]))).toBeCloseTo(1);
  });

  it("is zero for a right angle", () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0);
  });

  it("is zero when a vector has no length", () => {
    expect(cosine(Float32Array.from([0, 0]), Float32Array.from([1, 0]))).toBe(0);
  });

  it("refuses mismatched dimensions", () => {
    expect(() => cosine(Float32Array.from([1]), Float32Array.from([1, 0]))).toThrow(/Cannot compare/);
  });
});

describe("rankEntities", () => {
  it("returns the closest entities first", () => {
    const seeds = rankEntities(Float32Array.from([1, 0]), index, dataset, 2);
    expect(seeds.map((s) => s.id)).toEqual(["a", "b"]);
    expect(seeds[0].score).toBeGreaterThan(seeds[1].score);
  });

  it("ignores vectors for entities the dataset does not hold", () => {
    const seeds = rankEntities(Float32Array.from([1, 0]), index, dataset, 10);
    expect(seeds.map((s) => s.id)).not.toContain("ghost");
  });

  it("refuses a query embedded in another dimension", () => {
    expect(() => rankEntities(Float32Array.from([1, 0, 0]), index, dataset, 1)).toThrow(/dimensions/);
  });

  it("returns nothing when asked for nothing", () => {
    expect(rankEntities(Float32Array.from([1, 0]), index, dataset, 0)).toEqual([]);
  });
});

const seeds: Seed[] = [
  { id: "a", title: "Alpha", score: 1 },
  { id: "b", title: "Beta", score: 0.8 },
];

describe("buildLocalContext", () => {
  it("collects the seeds, their links, the report, the chunks and the claims", () => {
    const { context } = buildLocalContext(dataset, partition, seeds);
    expect(context.entities.map((e) => e.title)).toEqual(["Alpha", "Beta"]);
    expect(context.relationships.map((r) => r.id)).toContain("r1");
    expect(context.reports.map((r) => r.title)).toEqual(["Checkout"]);
    expect(context.sources.map((s) => s.id)).toEqual(["u1", "u2"]);
    expect(context.claims.map((c) => c.id)).toEqual(["cl1"]);
  });

  it("numbers each kind from one after the cut", () => {
    const { context } = buildLocalContext(dataset, partition, seeds);
    expect(context.entities.map((e) => e.shortId)).toEqual(["1", "2"]);
    expect(context.reports.map((r) => r.shortId)).toEqual(["1"]);
  });

  it("keeps links that leave the seed set as well", () => {
    const { context } = buildLocalContext(dataset, partition, seeds);
    expect(context.relationships.map((r) => r.id)).toEqual(expect.arrayContaining(["r1", "r2"]));
  });

  it("serves the seeds before anything else when the budget is small", () => {
    const { context, truncated } = buildLocalContext(dataset, partition, seeds, { ...DEFAULT_LOCAL, tokenBudget: 12 });
    expect(context.entities.length).toBeGreaterThan(0);
    expect(context.sources).toEqual([]);
    expect(truncated).toBe(true);
  });

  it("reports which group lost items", () => {
    const { dropped } = buildLocalContext(dataset, partition, seeds, { ...DEFAULT_LOCAL, tokenBudget: 12 });
    expect(Object.keys(dropped).length).toBeGreaterThan(0);
  });

  it("works without a partition and then has no reports", () => {
    const { context } = buildLocalContext(dataset, null, seeds);
    expect(context.reports).toEqual([]);
    expect(context.entities).toHaveLength(2);
  });

  it("returns an empty context for no seeds", () => {
    const { context, truncated } = buildLocalContext(dataset, partition, []);
    expect(context.entities).toEqual([]);
    expect(truncated).toBe(false);
  });
});
