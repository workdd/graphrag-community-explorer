import { describe, expect, it } from "vitest";
import type { Community, Dataset, Entity, Partition, Relationship } from "../model";
import { communitiesOf, neighborhoodSubgraph } from "./neighborhood";

const entity = (id: string, degree: number): Entity => ({ id, title: id, type: "T", degree, textUnitIds: [] });
const rel = (id: string, s: string, t: string, type = "calls"): Relationship => ({ id, sourceId: s, targetId: t, type, textUnitIds: [] });
const community = (id: string, entityIds: string[]): Community => ({
  id, level: 0, parentId: null, childIds: [], title: `C${id}`, entityIds, relationshipIds: [], size: entityIds.length, membershipSource: "entity_ids", textUnitIds: [],
});

// a - b - c - d chain plus a - x (typed "reads"); communities: {a,b} and {c,d,x}
const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map(["a", "b", "c", "d", "x"].map((id, i) => [id, entity(id, 5 - i)])),
  relationships: [rel("ab", "a", "b"), rel("bc", "b", "c"), rel("cd", "c", "d"), rel("ax", "a", "x", "reads")],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
};
const partition: Partition = { id: "p", label: "p", levels: [0], rootLevel: 0, communities: new Map([["1", community("1", ["a", "b"])], ["2", community("2", ["c", "d", "x"])]]) };

describe("neighborhoodSubgraph", () => {
  it("collects entities within the hop limit, seed first, with the edges among them", () => {
    const one = neighborhoodSubgraph(dataset, partition, "b", { hops: 1, maxNodes: 50 });
    expect(one.nodes.map((n) => n.entity.id)).toEqual(["b", "a", "c"]);
    expect(one.edges.map((e) => e.relationship.id)).toEqual(["ab", "bc"]);
    expect(one.stats).toMatchObject({ members: 3, shownMembers: 3, internalEdges: 2 });
    const two = neighborhoodSubgraph(dataset, partition, "b", { hops: 2, maxNodes: 50 });
    expect(two.nodes.map((n) => n.entity.id)).toEqual(["b", "a", "c", "d", "x"]);
    expect(communitiesOf(two.nodes)).toEqual(["2", "1"]);
  });

  it("respects the node budget and relationship type filter", () => {
    const capped = neighborhoodSubgraph(dataset, partition, "b", { hops: 2, maxNodes: 2 });
    expect(capped.nodes.map((n) => n.entity.id)).toEqual(["b", "a"]);
    expect(capped.stats).toMatchObject({ members: 5, shownMembers: 2 });
    const reads = neighborhoodSubgraph(dataset, partition, "a", { hops: 2, maxNodes: 50, relationshipTypes: new Set(["reads"]) });
    expect(reads.nodes.map((n) => n.entity.id)).toEqual(["a", "x"]);
    expect(reads.typeCounts.get("calls")).toBe(1);
  });
});
