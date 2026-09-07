import { describe, expect, it } from "vitest";
import { buildDataset } from "./graphrag";

const entity = (id: string, title: string, type = "Service", extra: Record<string, unknown> = {}) => ({
  id, human_readable_id: 0n, title, type, description: `${title} description`, text_unit_ids: [], ...extra,
});

describe("buildDataset (GraphRAG >= 1.0 layout)", () => {
  const tables = {
    entities: [entity("e1", "Cart API"), entity("e2", "Orders DB", "Database"), entity("e3", "Cart API"), entity("e4", "Lonely")],
    relationships: [
      { id: "r1", source: "Cart API", target: "Orders DB", weight: 2n, description: "writes" },
      { id: "r2", source: "Ghost", target: "Orders DB" },
    ],
    communities: [
      { id: "uuid-a", human_readable_id: 0n, community: 0n, level: 0n, parent: -1n, children: [1n], title: "Commerce", entity_ids: ["e1", "e2", "e4", "missing"], relationship_ids: ["r1"], size: 4n },
      { id: "uuid-b", human_readable_id: 1n, community: 1n, level: 1n, parent: 0n, children: [], title: "Checkout", entity_ids: ["e1", "e2"], relationship_ids: ["r1"], size: 2n },
    ],
    community_reports: [
      { community: 1n, level: 1n, title: "Checkout", summary: "Cart writes orders.", findings: [{ summary: "f", explanation: "x" }], rank: 7.5 },
      { community: 0n, summary: "Root", findings: "[{\"summary\":\"s\",\"explanation\":\"e\"}]" },
    ],
  };
  const { dataset, notes } = buildDataset(tables, ["entities.parquet"]);

  it("normalizes entities and resolves relationships by title, counting degree", () => {
    expect(dataset.entities.size).toBe(4);
    expect(dataset.relationships).toHaveLength(1);
    expect(dataset.relationships[0]).toMatchObject({ sourceId: "e1", targetId: "e2", weight: 2, type: "related" });
    expect(dataset.entities.get("e1")?.degree).toBe(1);
    expect(dataset.entities.get("e4")?.degree).toBe(0);
  });

  it("reports duplicate titles, dangling relationships and missing members as notes", () => {
    const kinds = Object.fromEntries(notes.map((n) => [n.kind, n.count]));
    expect(kinds).toEqual({ "duplicate-entity-title": 1, "dangling-relationship": 1, "missing-member": 1 });
  });

  it("keys communities by number, keeps uuid, derives children from parents and attaches reports", () => {
    const partition = dataset.partitions[0];
    const root = partition.communities.get("0")!;
    const child = partition.communities.get("1")!;
    expect(root).toMatchObject({ uuid: "uuid-a", level: 0, parentId: null, childIds: ["1"], size: 4 });
    expect(root.entityIds).toEqual(["e1", "e2", "e4"]);
    expect(child.parentId).toBe("0");
    expect(child.report?.rank).toBe(7.5);
    expect(root.report?.findings).toEqual([{ summary: "s", explanation: "e" }]);
    expect(partition.levels).toEqual([0, 1]);
    expect(partition.rootLevel).toBe(0);
    expect(dataset.source.kind).toBe("graphrag");
  });
});

describe("buildDataset (older and other layouts)", () => {
  it("infers members from relationship_ids when entity_ids is absent (GraphRAG 0.3)", () => {
    const { dataset } = buildDataset({
      entities: [entity("a", "A"), entity("b", "B"), entity("c", "C")].map(({ title, ...rest }) => ({ ...rest, name: title })),
      relationships: [{ id: "r1", source: "A", target: "B" }, { id: "r2", source: "B", target: "C" }],
      communities: [{ id: 3n, level: 0n, title: "Community 3", relationship_ids: ["r1"] }],
    }, []);
    const community = dataset.partitions[0].communities.get("3")!;
    expect(community.membershipSource).toBe("relationship_ids");
    expect(community.entityIds.sort()).toEqual(["a", "b"]);
    expect(community.size).toBe(2);
  });

  it("falls back to row ids when community numbers repeat across levels and resolves string parents", () => {
    const { dataset, notes } = buildDataset({
      entities: [entity("a", "A")],
      relationships: [],
      communities: [
        { id: "leiden:L1:0000", community: 0n, level: 1n, parent: null, title: "Top", entity_ids: ["a"], size: 1n },
        { id: "leiden:L2:0000", community: 0n, level: 2n, parent: "leiden:L1:0000", title: "Child", entity_ids: ["a"], size: 1n },
      ],
    }, []);
    const partition = dataset.partitions[0];
    expect([...partition.communities.keys()]).toEqual(["leiden:L1:0000", "leiden:L2:0000"]);
    expect(partition.communities.get("leiden:L2:0000")?.parentId).toBe("leiden:L1:0000");
    expect(partition.communities.get("leiden:L1:0000")?.childIds).toEqual(["leiden:L2:0000"]);
    expect(partition.rootLevel).toBe(1);
    expect(notes).toEqual([]);
  });

  it("resolves covariates to entity ids by title", () => {
    const { dataset } = buildDataset({
      entities: [entity("a", "Cart API"), entity("b", "Orders DB", "Database")],
      relationships: [],
      covariates: [{ id: "c1", type: "DEPENDENCY", description: "Cart API depends on Orders DB.", subject_id: "Cart API", object_id: "Orders DB", status: "TRUE", source_text: ["x", "y"] },
                    { id: "c2", covariate_type: "claim", description: "?", subject_id: "Ghost" }],
    }, []);
    expect(dataset.covariates).toHaveLength(2);
    expect(dataset.covariates[0]).toMatchObject({ subjectId: "a", objectId: "b", status: "TRUE", sourceText: "x y" });
    expect(dataset.covariates[1]).toMatchObject({ type: "claim", subjectId: undefined, subjectTitle: "Ghost" });
  });

  it("detects AGE exports, keeps high-numbered root levels and loads extra partitions", () => {
    const { dataset } = buildDataset({
      entities: [entity("1", "VM · web", "VirtualMachine", { age_properties_json: "{}" }), entity("2", "Vol", "BlockStorage")],
      relationships: [{ id: "r", source: "Vol", target: "VM · web", type: "attachedToVM", weight: 1 }],
      communities: [
        { id: "age-1", human_readable_id: 0n, community: 0n, level: 4n, parent: -1n, title: "Root", entity_ids: ["1", "2"], size: 2n },
        { id: "age-2", human_readable_id: 1n, community: 1n, level: 3n, parent: 0n, title: "Child", entity_ids: ["1"], size: 1n },
      ],
      extraPartitions: { leiden: [{ community: 0n, level: 0n, parent: -1n, title: "L0", entity_ids: ["1", "2"] }] },
    }, ["entities.parquet", "leiden_communities.parquet"]);
    expect(dataset.source.kind).toBe("age-export");
    expect(dataset.relationships[0].type).toBe("attachedToVM");
    expect(dataset.partitions.map((p) => p.id)).toEqual(["communities", "leiden"]);
    expect(dataset.partitions[0].rootLevel).toBe(4);
    expect(dataset.partitions[0].levels).toEqual([3, 4]);
  });
});
