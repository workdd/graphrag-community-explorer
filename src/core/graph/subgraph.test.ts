import { describe, expect, it } from "vitest";
import type { Community, Dataset, Entity, Partition, Relationship } from "../model";
import { displayTitle, typeColors } from "./palette";
import { bundleLeaves, communitySubgraph, relationshipsOf } from "./subgraph";

const entity = (id: string, degree: number, type = "Service"): Entity => ({ id, title: id, type, degree, textUnitIds: [] });
const rel = (id: string, sourceId: string, targetId: string, type = "calls"): Relationship => ({ id, sourceId, targetId, type, textUnitIds: [] });
const community = (id: string, entityIds: string[], level = 0): Community => ({
  id, level, parentId: null, childIds: [], title: `C${id}`, entityIds, relationshipIds: [], size: entityIds.length, membershipSource: "entity_ids", textUnitIds: [],
});

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([entity("a", 3), entity("b", 2), entity("c", 1), entity("x", 2, "Database"), entity("y", 1), entity("z", 1)].map((e) => [e.id, e])),
  relationships: [rel("ab", "a", "b"), rel("bc", "b", "c"), rel("ax", "a", "x", "reads"), rel("ay", "a", "y"), rel("bx", "b", "x", "reads"), rel("cz", "c", "z")],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
};
const partition: Partition = {
  id: "p", label: "p", levels: [0], rootLevel: 0,
  communities: new Map([["1", community("1", ["a", "b", "c"])], ["2", community("2", ["x", "y"])], ["3", community("3", ["z"])]]),
};

describe("communitySubgraph", () => {
  it("draws members with internal edges and ranks ghosts by how many boundary edges reach them", () => {
    const g = communitySubgraph(dataset, partition, ["1"], { maxNodes: 500, includeBoundary: true, maxBoundaryNodes: 1 });
    expect(g.nodes.filter((n) => !n.ghost).map((n) => n.entity.id)).toEqual(["a", "b", "c"]);
    expect(g.nodes.filter((n) => n.ghost).map((n) => n.entity.id)).toEqual(["x"]);
    expect(g.nodes.find((n) => n.entity.id === "x")?.community?.id).toBe("2");
    expect(g.edges.map((e) => `${e.relationship.id}${e.boundary ? "*" : ""}`)).toEqual(["ab", "bc", "ax*", "bx*"]);
    expect(g.stats).toEqual({ members: 3, shownMembers: 3, internalEdges: 2, boundaryEdges: 2, ghostNodes: 1, hiddenBoundaryEdges: 2 });
    expect([...g.typeCounts.entries()]).toEqual([["calls", 4], ["reads", 2]]);
  });

  it("caps members by degree, filters relationship types and can drop boundary edges", () => {
    const g = communitySubgraph(dataset, partition, ["1"], { maxNodes: 2, includeBoundary: false, maxBoundaryNodes: 10, relationshipTypes: new Set(["reads"]) });
    expect(g.nodes.map((n) => n.entity.id)).toEqual(["a", "b"]);
    expect(g.edges).toEqual([]);
    expect(g.stats.hiddenBoundaryEdges).toBe(2);
    expect(g.typeCounts.get("calls")).toBe(3);
  });

  it("merges several communities into one member set", () => {
    const g = communitySubgraph(dataset, partition, ["1", "2"], { maxNodes: 500, includeBoundary: true, maxBoundaryNodes: 10 });
    expect(g.nodes.filter((n) => !n.ghost).map((n) => n.entity.id)).toEqual(["a", "b", "x", "c", "y"]);
    expect(g.stats.internalEdges).toBe(5);
    expect(g.nodes.filter((n) => n.ghost).map((n) => n.entity.id)).toEqual(["z"]);
  });
});

describe("bundleLeaves", () => {
  const hubData: Dataset = {
    ...dataset,
    entities: new Map([entity("hub", 5), entity("l1", 1, "Vol"), entity("l2", 1, "Vol"), entity("l3", 1, "Vol"), entity("l4", 1, "Disk"), entity("m", 2)].map((e) => [e.id, e])),
    relationships: [rel("h1", "l1", "hub", "attached"), rel("h2", "l2", "hub", "attached"), rel("h3", "l3", "hub", "attached"), rel("h4", "l4", "hub", "attached"), rel("hm", "hub", "m"), rel("ml", "m", "l3")],
  };
  const hubPartition: Partition = { ...partition, communities: new Map([["1", community("1", ["hub", "l1", "l2", "l3", "l4", "m"])]]) };

  it("folds degree-one leaves of one type on one hub into a single node with one edge", () => {
    const raw = communitySubgraph(hubData, hubPartition, ["1"], { maxNodes: 500, includeBoundary: false, maxBoundaryNodes: 0 });
    const folded = bundleLeaves(raw, { minGroup: 2 });
    const bundle = folded.nodes.find((n) => n.bundle);
    // l3 has two edges, so it stays; l1 and l2 fold; l4 is a different type and alone.
    expect(bundle?.bundle).toMatchObject({ entityIds: ["l1", "l2"], type: "Vol", relationshipType: "attached", hubId: "hub", outgoing: true });
    expect(bundle?.entity.title).toBe("2 × Vol");
    expect(folded.nodes.map((n) => n.entity.id).sort()).toEqual(["bundle:hub|Vol|attached|out", "hub", "l3", "l4", "m"]);
    expect(folded.edges).toHaveLength(raw.edges.length - 1);
    expect(folded.edges.find((e) => e.relationship.id.startsWith("bundle:"))?.relationship).toMatchObject({ sourceId: "bundle:hub|Vol|attached|out", targetId: "hub", type: "attached" });
  });

  it("keeps a protected entity and small groups untouched", () => {
    const raw = communitySubgraph(hubData, hubPartition, ["1"], { maxNodes: 500, includeBoundary: false, maxBoundaryNodes: 0 });
    expect(bundleLeaves(raw, { minGroup: 2, keep: "l1" })).toBe(raw);
    expect(bundleLeaves(raw, { minGroup: 3 })).toBe(raw);
  });
});

describe("palette helpers", () => {
  it("assigns colors alphabetically and strips export decorations from labels", () => {
    const colors = typeColors(["Service", "Database", "Service"]);
    expect([...colors.keys()]).toEqual(["Database", "Service"]);
    expect(colors.get("Database")).not.toBe(colors.get("Service"));
    expect(displayTitle({ title: "VirtualMachine · web-01 [AGE:12345]", type: "VirtualMachine" })).toBe("web-01");
    expect(displayTitle({ title: "Cart API", type: "Service" })).toBe("Cart API");
  });

  it("lists relationships of an entity", () => {
    expect(relationshipsOf(dataset, "b").map((r) => r.id)).toEqual(["ab", "bc", "bx"]);
  });
});
