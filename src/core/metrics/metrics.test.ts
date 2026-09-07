import { describe, expect, it } from "vitest";
import type { Community, Dataset, Entity, Partition } from "../model";
import { checkIntegrity } from "./integrity";
import { datasetCounts, summarizePartition } from "./summary";

const entity = (id: string, degree = 0): Entity => ({ id, title: id, type: id.startsWith("d") ? "Database" : "Service", degree, textUnitIds: [] });
const community = (id: string, parentId: string | null, entityIds: string[], size = entityIds.length, extra: Partial<Community> = {}): Community => ({
  id, level: parentId === null ? 0 : 1, parentId, childIds: [], title: `C${id}`, entityIds, relationshipIds: [], size, membershipSource: "entity_ids", textUnitIds: [], ...extra,
});

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map(["a", "b", "c", "d1", "e"].map((id) => [id, entity(id, id === "e" ? 0 : 1)])),
  relationships: [
    { id: "r1", sourceId: "a", targetId: "b", type: "calls", textUnitIds: [] },
    { id: "r2", sourceId: "b", targetId: "c", type: "calls", textUnitIds: [] },
    { id: "r3", sourceId: "c", targetId: "d1", type: "reads", textUnitIds: [] },
  ],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
};
const partition: Partition = {
  id: "p", label: "p", levels: [0, 1], rootLevel: 0,
  communities: new Map([
    ["0", community("0", null, ["a", "b", "c"])],
    ["1", community("1", "0", ["a", "b"], 3)],
    ["2", community("2", "0", ["c", "d1"])],
    ["3", community("3", "7", [], 0, { membershipSource: "relationship_ids" })],
  ]),
};

describe("summary", () => {
  it("counts dataset totals and types", () => {
    const counts = datasetCounts(dataset);
    expect(counts).toMatchObject({ entities: 5, relationships: 3, isolatedEntities: 1 });
    expect(counts.entityTypes.get("Database")).toBe(1);
    expect(counts.relationshipTypes.get("calls")).toBe(2);
  });

  it("splits relationships into internal and boundary per community", () => {
    const summary = summarizePartition(dataset, partition);
    expect(summary.metrics.get("0")).toEqual({ internalEdges: 2, boundaryEdges: 1, internalRatio: 2 / 3 });
    expect(summary.metrics.get("1")).toEqual({ internalEdges: 1, boundaryEdges: 1, internalRatio: 0.5 });
    expect(summary.metrics.get("2")).toEqual({ internalEdges: 1, boundaryEdges: 1, internalRatio: 0.5 });
    expect(summary.metrics.get("3")).toEqual({ internalEdges: 0, boundaryEdges: 0, internalRatio: 0 });
    expect(summary.coveredEntities).toBe(4);
    expect(summary.coverage).toBe(0.8);
    expect(summary.multiMembership).toBe(0);
  });

  it("counts overlap only within the same level", () => {
    const overlapping: Partition = {
      ...partition,
      communities: new Map([
        ["1", community("1", null, ["a", "b"])],
        ["2", community("2", null, ["b", "c"])],
      ]),
    };
    expect(summarizePartition(dataset, overlapping).multiMembership).toBe(1);
  });
});

describe("integrity", () => {
  it("flags structural problems and informs about coverage", () => {
    const findings = Object.fromEntries(checkIntegrity(dataset, partition).map((f) => [f.kind, f]));
    expect(findings["missing-parent"]).toMatchObject({ severity: "warning", count: 1, samples: ["C3 -> 7"] });
    expect(findings["not-nested"]).toMatchObject({ count: 1 });
    expect(findings["not-nested"].samples[0]).toContain("C2: 1 of 2 not in C0");
    expect(findings["size-mismatch"]).toMatchObject({ count: 1 });
    expect(findings["empty-community"]).toMatchObject({ count: 1, samples: ["C3"] });
    expect(findings["inferred-membership"]).toMatchObject({ severity: "info", count: 1 });
    expect(findings["uncovered-entities"]).toMatchObject({ count: 1, samples: ["e"] });
    expect(findings["isolated-entities"]).toMatchObject({ count: 1 });
    expect(findings["parent-cycle"]).toBeUndefined();
  });
});
