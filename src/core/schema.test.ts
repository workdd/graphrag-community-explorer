import { describe, expect, it } from "vitest";
import type { Community, Dataset, Partition } from "./model";
import { contextFor, describeTables } from "./schema";

const entity = (id: string, degree: number, units: string[] = []) => [id, { id, title: id.toUpperCase(), type: "T", degree, textUnitIds: units }] as const;
const rel = (id: string, sourceId: string, targetId: string, units: string[] = []) => ({ id, sourceId, targetId, type: "related", textUnitIds: units });
const community = (id: string, level: number, parentId: string | null, entityIds: string[], childIds: string[] = [], rank?: number): Community => ({
  id, level, parentId, childIds, title: `C${id}`, entityIds, relationshipIds: [], size: entityIds.length, membershipSource: "entity_ids", textUnitIds: [],
  report: rank === undefined ? undefined : { summary: "", findings: [], rank },
});

// a-b-c inside community 1 (parent 0); d outside, linked to c; e isolated.
const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([entity("a", 2, ["u1"]), entity("b", 1), entity("c", 3), entity("d", 1), entity("e", 0)]),
  relationships: [rel("ab", "a", "b", ["u1"]), rel("ac", "a", "c"), rel("cd", "c", "d", ["u2"]), rel("cb", "c", "b")],
  partitions: [],
  textUnits: new Map([
    ["u1", { id: "u1", text: "a and b", documentIds: [], entityIds: ["a", "b"], relationshipIds: ["ab"] }],
    ["u2", { id: "u2", text: "c and d", documentIds: [], entityIds: ["c", "d"], relationshipIds: ["cd"] }],
    ["u3", { id: "u3", text: "nothing", documentIds: [], entityIds: ["e"], relationshipIds: [] }],
  ]),
  documents: new Map(),
  covariates: [],
};
const partition: Partition = {
  id: "communities", label: "Communities", levels: [0, 1], rootLevel: 0,
  communities: new Map([
    ["0", community("0", 0, null, ["a", "b", "c", "d"], ["1"], 7)],
    ["1", community("1", 1, "0", ["a", "b", "c"], [], 5)],
  ]),
};

describe("contextFor", () => {
  it("ranks a community's rows the way local search does", () => {
    const ctx = contextFor(dataset, partition, { kind: "community", id: "1" });
    expect(ctx.entities.map((r) => r.entity.id)).toEqual(["c", "a", "b"]);
    expect(ctx.relationships.map((r) => `${r.relationship.id}:${r.network}:${r.combinedDegree}`)).toEqual(["ac:in:5", "cb:in:4", "ab:in:3", "cd:out:4"]);
    // u1 carries two scoped entities and one scoped relationship; u2 carries one of each; u3 none.
    expect(ctx.textUnits.map((r) => `${r.unit.id}:${r.entityHits}/${r.relationshipHits}`)).toEqual(["u1:2/1", "u2:1/1"]);
    // the trail (root then self) followed by children, with member matches and ranks
    expect(ctx.communities.map((r) => `${r.community.id}:${r.matches}:${r.rank}`)).toEqual(["0:3:7", "1:3:5"]);
  });

  it("builds an entity scope from the entity and its neighbours", () => {
    const ctx = contextFor(dataset, partition, { kind: "entity", id: "d" });
    expect(ctx.scoped.map((e) => e.id)).toEqual(["d", "c"]);
    expect(ctx.relationships.map((r) => `${r.relationship.id}:${r.network}`)).toEqual(["cd:in", "ac:out", "cb:out"]);
    expect(ctx.communities.map((r) => r.community.id)).toEqual(["0"]);
  });

  it("falls back to the most connected entities and ranked communities without a selection", () => {
    const ctx = contextFor(dataset, partition, { kind: "all" }, { entities: 2, inNetwork: 5, outNetwork: 5, textUnits: 5, communities: 1 });
    expect(ctx.entities.map((r) => r.entity.id)).toEqual(["c", "a"]);
    expect(ctx.communities.map((r) => r.community.id)).toEqual(["0"]);
  });

  it("works without a partition", () => {
    const ctx = contextFor(dataset, null, { kind: "entity", id: "a" });
    expect(ctx.communities).toEqual([]);
    expect(ctx.entities.length).toBe(3);
  });
});

describe("describeTables", () => {
  it("classifies columns and flags references to tables that were not loaded", () => {
    const tables = describeTables([
      { name: "entities", rows: 5, columns: ["id", "human_readable_id", "title", "type", "description", "text_unit_ids", "degree", "x", "y"] },
      { name: "relationships", rows: 4, columns: ["id", "source", "target", "weight", "description", "text_unit_ids"] },
      { name: "leiden_communities", rows: 3, columns: ["id", "community", "level", "parent", "entity_ids"] },
    ]);
    const entities = tables.find((t) => t.name === "entities")!;
    expect(entities.loaded).toBe(true);
    expect(entities.columns.map((c) => `${c.name}:${c.kind}${c.dangling ? "!" : ""}`)).toEqual([
      "id:key", "human_readable_id:key", "title:used", "type:used", "description:used", "text_unit_ids:ref!", "degree:used", "x:plain", "y:plain",
    ]);
    const relationships = tables.find((t) => t.name === "relationships")!;
    expect(relationships.columns.find((c) => c.name === "source")?.ref).toEqual({ column: "source", to: "entities", toColumn: "title" });
    expect(relationships.columns.find((c) => c.name === "source")?.dangling).toBe(false);
    // known tables keep their order and are listed even when absent
    expect(tables.map((t) => `${t.name}:${t.loaded ? 1 : 0}`)).toEqual([
      "documents:0", "text_units:0", "entities:1", "relationships:1", "communities:0", "community_reports:0", "covariates:0", "leiden_communities:1",
    ]);
    const extra = tables[tables.length - 1];
    expect(extra.extra).toBe(true);
    expect(extra.columns.find((c) => c.name === "parent")?.ref?.to).toBe("communities");
  });
});
