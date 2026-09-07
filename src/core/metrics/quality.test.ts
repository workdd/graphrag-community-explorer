import { describe, expect, it } from "vitest";
import type { Community, Dataset, Entity, Partition, Relationship } from "../model";
import { compareAssignments } from "./compare";
import { assignmentAtLevel, communityQuality, levelQuality, modularity, sizeHistogram } from "./quality";

const entity = (id: string, degree: number): Entity => ({ id, title: id, type: "T", degree, textUnitIds: [] });
const rel = (id: string, s: string, t: string): Relationship => ({ id, sourceId: s, targetId: t, type: "r", textUnitIds: [] });
const community = (id: string, level: number, parentId: string | null, entityIds: string[]): Community => ({
  id, level, parentId, childIds: [], title: `C${id}`, entityIds, relationshipIds: [], size: entityIds.length, membershipSource: "entity_ids", textUnitIds: [],
});

// Two triangles joined by one edge: a classic two-community graph.
const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map(["a", "b", "c", "d", "e", "f"].map((id) => [id, entity(id, id === "c" || id === "d" ? 3 : 2)])),
  relationships: [rel("1", "a", "b"), rel("2", "b", "c"), rel("3", "a", "c"), rel("4", "c", "d"), rel("5", "d", "e"), rel("6", "e", "f"), rel("7", "d", "f")],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
};
const partition: Partition = {
  id: "p", label: "p", levels: [0, 1], rootLevel: 0,
  communities: new Map([
    ["0", community("0", 0, null, ["a", "b", "c", "d", "e", "f"])],
    ["1", community("1", 1, "0", ["a", "b", "c"])],
    ["2", community("2", 1, "0", ["d", "e", "f"])],
  ]),
};

describe("community quality", () => {
  it("computes density, conductance and average degree", () => {
    const q = communityQuality(dataset, partition);
    expect(q.get("1")).toEqual({ size: 3, internalEdges: 3, boundaryEdges: 1, internalRatio: 0.75, density: 1, conductance: 1 / 7, averageDegree: 2 });
    expect(q.get("0")?.conductance).toBe(0);
  });

  it("computes modularity per level: the two triangles score well, the single root scores zero", () => {
    const levels = levelQuality(dataset, partition);
    expect(levels.map((l) => l.level)).toEqual([0, 1]);
    expect(levels[0].modularity).toBeCloseTo(0, 6);
    expect(levels[1].modularity).toBeCloseTo(2 * (3 / 7 - (7 / 14) ** 2), 6);
    expect(levels[1]).toMatchObject({ communities: 2, coveredEntities: 6, coverage: 1, medianSize: 3, largestSize: 3 });
    expect(modularity(dataset, new Map())).toBe(0);
  });

  it("assigns entities to the smallest community of a level and buckets sizes", () => {
    expect([...assignmentAtLevel(partition, 1).entries()]).toEqual([["a", "1"], ["b", "1"], ["c", "1"], ["d", "2"], ["e", "2"], ["f", "2"]]);
    expect(sizeHistogram(partition.communities.values())).toEqual([2, 1, 0, 0, 0, 0, 0]);
  });
});

describe("partition comparison", () => {
  const a = new Map([["a", "x"], ["b", "x"], ["c", "x"], ["d", "y"], ["e", "y"], ["f", "y"]]);
  it("scores identical groupings as 1 and reports overlaps", () => {
    const same = new Map([...a.entries()].map(([k, v]) => [k, `${v}2`]));
    const c = compareAssignments(a, same);
    expect(c.common).toBe(6);
    expect(c.nmi).toBeCloseTo(1, 9);
    expect(c.ari).toBeCloseTo(1, 9);
    expect(c.crosstab).toEqual([{ a: "x", b: "x2", count: 3 }, { a: "y", b: "y2", count: 3 }]);
  });

  it("scores a grouping that mixes the two halves lower, and ignores entities missing from one side", () => {
    const mixed = new Map([["a", "p"], ["b", "p"], ["c", "q"], ["d", "q"], ["e", "p"], ["f", "q"], ["zzz", "p"]]);
    const c = compareAssignments(a, mixed);
    expect(c.common).toBe(6);
    expect(c.onlyInB).toBe(1);
    expect(c.nmi).toBeLessThan(0.2);
    expect(c.ari).toBeLessThan(0.2);
    expect(c.ari).toBeGreaterThan(-0.5);
  });
});
