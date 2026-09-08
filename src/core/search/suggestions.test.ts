import { describe, expect, it } from "vitest";
import type { Community, Dataset, Partition } from "../model";
import { suggestQuestions } from "./suggestions";

const entity = (id: string, title: string, degree: number) => ({ id, title, type: "Service", degree, textUnitIds: [] });

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([
    ["a", entity("a", "Service · Alpha [AGE:1]", 9)],
    ["b", entity("b", "Service · Beta [AGE:2]", 4)],
    ["c", entity("c", "Service · Lonely [AGE:3]", 0)],
  ]),
  relationships: [],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
};

const community = (id: string, title: string, rank: number, withReport = true): Community => ({
  id, level: 0, parentId: null, childIds: [], title, entityIds: [], relationshipIds: [], size: 5,
  membershipSource: "entity_ids", textUnitIds: [],
  report: withReport ? { summary: "s", findings: [], rank } : undefined,
});

const partition: Partition = {
  id: "p", label: "p", levels: [0], rootLevel: 0,
  communities: new Map([
    ["k1", community("k1", "Checkout", 8)],
    ["k2", community("k2", "Catalog", 5)],
    ["k3", community("k3", "No report", 9, false)],
  ]),
};

describe("suggestQuestions", () => {
  it("names the best connected entity for a local question", () => {
    const out = suggestQuestions({ dataset, partition, hasEmbeddings: true });
    const local = out.filter((s) => s.method === "local");
    expect(local[0].vars.entity).toBe("Alpha");
    expect(local[1].vars).toEqual({ entity: "Alpha", other: "Beta" });
  });

  it("never names an entity with no relationships", () => {
    const out = suggestQuestions({ dataset, partition, hasEmbeddings: true });
    expect(JSON.stringify(out)).not.toContain("Lonely");
  });

  it("offers no local question without the embeddings that answer it", () => {
    const out = suggestQuestions({ dataset, partition, hasEmbeddings: false });
    expect(out.every((s) => s.method === "global")).toBe(true);
  });

  it("names the highest ranked communities for a global question", () => {
    const out = suggestQuestions({ dataset, partition, hasEmbeddings: true });
    const pair = out.find((s) => s.template.includes("{community}"));
    expect(pair?.vars).toEqual({ community: "Checkout", other: "Catalog" });
  });

  it("skips communities that carry no summary, since global reads nothing else", () => {
    const out = suggestQuestions({ dataset, partition, hasEmbeddings: true });
    expect(JSON.stringify(out)).not.toContain("No report");
  });

  it("offers no global question when no community has a summary", () => {
    const bare: Partition = { ...partition, communities: new Map([["k3", community("k3", "No report", 9, false)]]) };
    const out = suggestQuestions({ dataset, partition: bare, hasEmbeddings: true });
    expect(out.every((s) => s.method === "local")).toBe(true);
  });

  it("offers nothing at all for an index that supports neither", () => {
    const empty: Dataset = { ...dataset, entities: new Map() };
    expect(suggestQuestions({ dataset: empty, partition: null, hasEmbeddings: false })).toEqual([]);
  });

  it("keeps the top entity on a small index, where every node looks like a hub", () => {
    const out = suggestQuestions({ dataset, partition, hasEmbeddings: true });
    expect(out.find((s) => s.method === "local")?.vars.entity).toBe("Alpha");
  });

  it("skips a hub linked to a large share of the graph", () => {
    const many = new Map(dataset.entities);
    many.set("hub", entity("hub", "Service · Everything [AGE:9]", 999));
    for (let i = 0; i < 200; i += 1) many.set(`f${i}`, entity(`f${i}`, `Service · Filler ${i}`, 1));
    const out = suggestQuestions({ dataset: { ...dataset, entities: many }, partition, hasEmbeddings: true });
    expect(JSON.stringify(out)).not.toContain("Everything");
    expect(JSON.stringify(out)).toContain("Alpha");
  });

  it("pairs communities from one level, never a community with its own parent", () => {
    const nested: Partition = {
      ...partition,
      communities: new Map([
        ["k1", community("k1", "Checkout", 8)],
        ["k2", { ...community("k2", "Checkout child", 9), level: 1 }],
        ["k3", community("k3", "Catalog", 5)],
      ]),
    };
    const out = suggestQuestions({ dataset, partition: nested, hasEmbeddings: true });
    // The top-ranked community is alone on level 1, so the pair comes from the level that has two.
    const pair = out.find((s) => s.template.includes("{community}"));
    expect(pair?.vars).toEqual({ community: "Checkout", other: "Catalog" });
  });

  it("offers no pair question when only one community sits on the best level", () => {
    const lonely: Partition = { ...partition, communities: new Map([["k1", community("k1", "Only", 8)]]) };
    const out = suggestQuestions({ dataset, partition: lonely, hasEmbeddings: true });
    expect(out.some((s) => s.template.includes("{community}"))).toBe(false);
    expect(out.some((s) => s.method === "global")).toBe(true);
  });

  it("says what each question is meant to exercise", () => {
    for (const s of suggestQuestions({ dataset, partition, hasEmbeddings: true })) {
      expect(s.why.length).toBeGreaterThan(20);
    }
  });
});

describe("relational questions", () => {
  it("offers an impact question and a dependency question", () => {
    const many = new Map(dataset.entities);
    many.set("d", entity("d", "Service · Delta [AGE:4]", 3));
    const out = suggestQuestions({ dataset: { ...dataset, entities: many }, partition, hasEmbeddings: true });
    expect(out.some((s) => s.template.includes("removed or scaled down"))).toBe(true);
    expect(out.some((s) => s.template.includes("depends on"))).toBe(true);
  });

  it("spreads the questions over different entities instead of asking about one", () => {
    const many = new Map(dataset.entities);
    many.set("d", entity("d", "Service · Delta [AGE:4]", 3));
    const named = suggestQuestions({ dataset: { ...dataset, entities: many }, partition, hasEmbeddings: true })
      .filter((s) => s.method === "local")
      .map((s) => s.vars.entity);
    expect(new Set(named).size).toBeGreaterThan(1);
  });

  it("drops the questions it has no entity for", () => {
    const one = new Map([["a", entity("a", "Service · Alpha [AGE:1]", 9)]]);
    const out = suggestQuestions({ dataset: { ...dataset, entities: one }, partition, hasEmbeddings: true });
    expect(out.some((s) => s.template.includes("depends on"))).toBe(false);
    expect(out.some((s) => s.method === "local")).toBe(true);
  });
});
