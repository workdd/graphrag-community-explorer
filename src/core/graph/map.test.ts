import { describe, expect, it } from "vitest";
import type { Community, Dataset, Entity, Partition, Relationship } from "../model";
import { UNASSIGNED_ID, buildMapModel, nestingRatio } from "./map";

const entity = (id: string, degree = 1): Entity => ({ id, title: id, type: "Service", degree, textUnitIds: [] });
const rel = (id: string, sourceId: string, targetId: string): Relationship => ({ id, sourceId, targetId, type: "calls", textUnitIds: [] });
const community = (id: string, level: number, parentId: string | null, entityIds: string[], childIds: string[] = []): Community => ({
  id, level, parentId, childIds, title: `C${id}`, entityIds, relationshipIds: [], size: entityIds.length, membershipSource: "entity_ids",
});
const partitionOf = (list: Community[]): Partition => ({
  id: "p", label: "p", communities: new Map(list.map((c) => [c.id, c])), levels: [...new Set(list.map((c) => c.level))].sort(), rootLevel: 0,
});

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map(["a", "b", "c", "d", "e", "f", "z"].map((id, i) => [id, entity(id, 7 - i)])),
  relationships: [rel("ab", "a", "b"), rel("bc", "b", "c"), rel("cd", "c", "d"), rel("de", "d", "e"), rel("ef", "e", "f"), rel("fz", "f", "z"), rel("az", "a", "z")],
  partitions: [],
};
// Nested: root 0 ⊃ {1, 2}; 1 = {a, b}, 2 = {c, d}; root keeps e as its own extra member; f and z are unassigned.
const nestedPartition = partitionOf([
  community("0", 0, null, ["a", "b", "c", "d", "e"], ["1", "2"]),
  community("1", 1, "0", ["a", "b"]),
  community("2", 1, "0", ["c", "d"]),
]);
// Not nested: child 1 has a member the parent lacks.
const loosePartition = partitionOf([community("0", 0, null, ["a"], ["1"]), community("1", 1, "0", ["b", "c"])]);

const base = { baseLevel: null, expanded: new Set<string>(), showUnassigned: true, maxEntities: 100 };

describe("buildMapModel", () => {
  it("detects nesting and draws only roots until they are opened", () => {
    expect(nestingRatio(nestedPartition)).toBe(1);
    expect(nestingRatio(loosePartition)).toBe(0);
    const model = buildMapModel(dataset, nestedPartition, base);
    expect(model.nested).toBe(true);
    expect(model.communities.map((c) => c.community.id)).toEqual(["0"]);
    expect(model.entities).toEqual([]);
    expect(model.unassigned).toEqual({ total: 2, drawn: 0, open: false });
    expect(model.aggregateEdges).toEqual([{ a: "community:0", b: "unassigned", count: 2 }]);
  });

  it("opening a nested parent shows its children as nodes and its own extra members as entities", () => {
    const model = buildMapModel(dataset, nestedPartition, { ...base, expanded: new Set(["0"]) });
    expect(model.communities.map((c) => `${c.community.id}${c.open ? "+" : ""}@${c.containerId ?? "-"}`)).toEqual(["0+@-", "1@0", "2@0"]);
    expect(model.entities.map((e) => `${e.entity.id}@${e.containerId}`)).toEqual(["e@0"]);
    expect(model.aggregateEdges).toEqual([
      { a: "community:1", b: "community:2", count: 1 },
      { a: "community:2", b: "entity:e", count: 1 },
      { a: "entity:e", b: "unassigned", count: 1 },
      { a: "community:1", b: "unassigned", count: 1 },
    ]);
  });

  it("opening leaves draws entity-to-entity edges and respects the entity budget", () => {
    const model = buildMapModel(dataset, nestedPartition, { ...base, expanded: new Set(["0", "1", "2"]), maxEntities: 3 });
    expect(model.entities.map((e) => e.entity.id)).toEqual(["e", "a", "b"]);
    expect(model.stats.truncatedEntities).toBe(2);
    expect(model.entityEdges.map((r) => r.id)).toEqual(["ab"]);
    expect(model.aggregateEdges.find((e) => e.a === "community:2" && e.b === "entity:b")).toEqual({ a: "community:2", b: "entity:b", count: 1 });
  });

  it("flattens a level and draws parent links when the hierarchy is not a containment", () => {
    const flat = buildMapModel(dataset, nestedPartition, { ...base, baseLevel: 1 });
    expect(flat.communities.map((c) => c.community.id)).toEqual(["1", "2"]);
    expect(flat.parentLinks).toEqual([]);
    const loose = buildMapModel(dataset, loosePartition, base);
    expect(loose.nested).toBe(false);
    expect(loose.communities.map((c) => c.community.id)).toEqual(["0", "1"]);
    expect(loose.parentLinks).toEqual([{ childId: "1", parentId: "0" }]);
  });

  it("opens the unassigned group as entities", () => {
    const model = buildMapModel(dataset, nestedPartition, { ...base, expanded: new Set([UNASSIGNED_ID]) });
    expect(model.entities.map((e) => `${e.entity.id}@${e.containerId}`)).toEqual(["f@unassigned", "z@unassigned"]);
    expect(model.unassigned).toEqual({ total: 2, drawn: 2, open: true });
    expect(model.entityEdges.map((r) => r.id)).toEqual(["fz"]);
  });
});
