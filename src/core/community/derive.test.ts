import { describe, expect, it } from "vitest";
import type { Dataset, Entity, Relationship } from "../model";
import { derivePartition, nameCommunity } from "./derive";
import { levelQuality } from "../metrics/quality";

const entity = (id: string, degree: number, title = id): Entity => ({
  id,
  title,
  type: "T",
  degree,
  textUnitIds: [],
});
const rel = (id: string, s: string, t: string): Relationship => ({ id, sourceId: s, targetId: t, type: "r", textUnitIds: [] });

const datasetOf = (entities: Entity[], relationships: Relationship[]): Dataset => ({
  source: { kind: "unknown", files: [] },
  entities: new Map(entities.map((e) => [e.id, e])),
  relationships,
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
});

/** Four cliques of five, joined in a ring by one edge each: a graph with an obvious answer. */
const cliques = (): Dataset => {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];
  for (let c = 0; c < 4; c += 1) {
    for (let i = 0; i < 5; i += 1) entities.push(entity(`c${c}n${i}`, 4));
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) relationships.push(rel(`e${c}-${i}-${j}`, `c${c}n${i}`, `c${c}n${j}`));
    }
  }
  for (let c = 0; c < 4; c += 1) {
    relationships.push(rel(`bridge${c}`, `c${c}n0`, `c${(c + 1) % 4}n0`));
  }
  return datasetOf(entities, relationships);
};

describe("naming a group nobody has named", () => {
  const dataset = datasetOf(
    [entity("a", 9, "Alpha"), entity("b", 5, "Beta"), entity("c", 1, "Gamma")],
    [],
  );

  it("uses the two busiest members and a count", () => {
    expect(nameCommunity(dataset, ["a", "b", "c"])).toBe("Alpha, Beta and 1 more");
  });

  it("reads plainly at one and two members", () => {
    expect(nameCommunity(dataset, ["b"])).toBe("Beta");
    expect(nameCommunity(dataset, ["c", "a"])).toBe("Alpha and Gamma");
  });

  it("says something rather than nothing for an empty group", () => {
    expect(nameCommunity(dataset, [])).toBe("Empty");
  });
});

describe("computing communities for a graph that arrived without any", () => {
  it("finds the cliques", () => {
    const partition = derivePartition(cliques(), { seed: 1 });
    const finest = Math.max(...partition.levels);
    const atFinest = [...partition.communities.values()].filter((c) => c.level === finest);
    expect(atFinest).toHaveLength(4);
    expect(atFinest.every((c) => c.size === 5)).toBe(true);
  });

  it("says it was computed, and by what, so nobody reads it as shipped", () => {
    const partition = derivePartition(cliques(), { seed: 1 });
    expect(partition.computed).toMatchObject({ algorithm: "leiden", resolution: 1 });
    expect(partition.computed!.modularity).toBeGreaterThan(0.3);
  });

  it("covers every entity that has an edge", () => {
    const dataset = cliques();
    const partition = derivePartition(dataset, { seed: 1 });
    const claimed = new Set<string>();
    for (const community of partition.communities.values()) {
      if (community.level === Math.max(...partition.levels)) for (const id of community.entityIds) claimed.add(id);
    }
    expect(claimed.size).toBe(dataset.entities.size);
  });

  it("counts the relationships inside each community", () => {
    const partition = derivePartition(cliques(), { seed: 1 });
    const finest = Math.max(...partition.levels);
    const inside = [...partition.communities.values()]
      .filter((c) => c.level === finest)
      .map((c) => c.relationshipIds.length);
    // Each clique of five holds ten edges; the bridges belong to no community.
    expect(inside).toEqual([10, 10, 10, 10]);
  });

  it("produces a hierarchy the rest of the app can read", () => {
    const dataset = cliques();
    const partition = derivePartition(dataset, { seed: 1 });
    expect(partition.rootLevel).toBe(0);
    // Every level scores, and the levels the quality view computes line up with the partition's.
    const levels = levelQuality(dataset, partition);
    expect(levels.map((l) => l.level)).toEqual(partition.levels);
    expect(levels[levels.length - 1].modularity).toBeGreaterThan(0.3);
    // A child sits inside its parent.
    for (const community of partition.communities.values()) {
      if (community.parentId === null) continue;
      const parent = partition.communities.get(community.parentId)!;
      expect(community.entityIds.every((id) => parent.entityIds.includes(id))).toBe(true);
    }
  });

  it("keeps no level that says nothing", () => {
    const partition = derivePartition(cliques(), { seed: 1 });
    for (const level of partition.levels) {
      const groups = [...partition.communities.values()].filter((c) => c.level === level);
      expect(groups.length).toBeGreaterThan(1);
      expect(groups.length).toBeLessThan(20);
    }
  });

  it("has nothing to say about a graph with no edges", () => {
    const partition = derivePartition(datasetOf([entity("a", 0), entity("b", 0)], []), { seed: 1 });
    expect(partition.communities.size).toBe(0);
    expect(partition.levels).toEqual([]);
  });

  it("is deterministic for a seed", () => {
    const a = derivePartition(cliques(), { seed: 7 });
    const b = derivePartition(cliques(), { seed: 7 });
    expect([...a.communities.keys()]).toEqual([...b.communities.keys()]);
  });
});
