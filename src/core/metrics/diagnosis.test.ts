import { describe, expect, it } from "vitest";
import type { Community, Dataset, Entity, Partition, Relationship, TextUnit } from "../model";
import { busiestEntity, countBySeverity, diagnose, unclaimedEntities, type Finding } from "./diagnosis";
import { levelQuality } from "./quality";

const entity = (id: string, degree: number, description = "a description long enough to rank on"): Entity => ({
  id,
  title: id,
  type: "T",
  description,
  degree,
  textUnitIds: [],
});
const rel = (id: string, s: string, t: string, description = "how the two are connected"): Relationship => ({
  id,
  sourceId: s,
  targetId: t,
  type: "r",
  description,
  textUnitIds: [],
});
const community = (id: string, level: number, entityIds: string[], withReport = true): Community => ({
  id,
  level,
  parentId: null,
  childIds: [],
  title: `C${id}`,
  entityIds,
  relationshipIds: [],
  size: entityIds.length,
  membershipSource: "entity_ids",
  textUnitIds: [],
  ...(withReport ? { report: { summary: "s", findings: [] } } : {}),
});
const chunk = (id: string): TextUnit => ({ id, text: "source text", documentIds: [], entityIds: [], relationshipIds: [] });

/** Two triangles joined by one edge, every entity in a community, source text present. */
const healthy = (): { dataset: Dataset; partition: Partition } => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const dataset: Dataset = {
    source: { kind: "graphrag", files: [] },
    entities: new Map(ids.map((id) => [id, entity(id, id === "c" || id === "d" ? 3 : 2)])),
    relationships: [
      rel("1", "a", "b"), rel("2", "b", "c"), rel("3", "a", "c"),
      rel("4", "c", "d"),
      rel("5", "d", "e"), rel("6", "e", "f"), rel("7", "d", "f"),
    ],
    partitions: [],
    textUnits: new Map([["t1", chunk("t1")]]),
    documents: new Map(),
    covariates: [],
  };
  const partition: Partition = {
    id: "p",
    label: "p",
    levels: [1],
    rootLevel: 1,
    communities: new Map([
      ["1", community("1", 1, ["a", "b", "c"])],
      ["2", community("2", 1, ["d", "e", "f"])],
    ]),
  };
  return { dataset, partition };
};

const run = (dataset: Dataset, partition: Partition | null, hasEmbeddings = true): Finding[] =>
  diagnose({ dataset, partition, levels: partition ? levelQuality(dataset, partition) : [], hasEmbeddings });

const ids = (findings: Finding[]): string[] => findings.map((f) => f.id);
const one = (findings: Finding[], id: string): Finding => {
  const found = findings.find((f) => f.id === id);
  if (!found) throw new Error(`no finding ${id} in ${ids(findings).join(", ")}`);
  return found;
};

describe("an index with nothing wrong", () => {
  it("reports what is fine and nothing to fix", () => {
    const { dataset, partition } = healthy();
    const findings = run(dataset, partition);
    expect(countBySeverity(findings, "fix")).toBe(0);
    expect(countBySeverity(findings, "watch")).toBe(0);
    expect(ids(findings)).toContain("modularity-holds");
    expect(ids(findings)).toContain("source-text");
  });

  it("puts anything to fix before anything to watch, and both before what is fine", () => {
    const { dataset, partition } = healthy();
    dataset.entities.set("z", entity("z", 0));
    partition.communities.get("1")!.report = undefined;
    const order = run(dataset, partition).map((f) => f.severity);
    expect(order).toEqual([...order].sort((a, b) => ({ fix: 0, watch: 1, ok: 2 })[a] - ({ fix: 0, watch: 1, ok: 2 })[b]));
  });
});

describe("entities no community claims", () => {
  it("names them and says global search cannot see them", () => {
    const { dataset, partition } = healthy();
    for (const id of ["x", "y", "z"]) dataset.entities.set(id, entity(id, 2));
    const finding = one(run(dataset, partition), "unclaimed");
    expect(finding.severity).toBe("fix"); // 3 of 9 is a third, well past a tenth
    expect(finding.affects).toBe("global");
    expect(finding.vars).toMatchObject({ count: 3, share: "33%" });
  });

  it("is worth watching but not fixing when it is a small share", () => {
    const { dataset, partition } = healthy();
    for (let i = 0; i < 60; i += 1) {
      const id = `m${i}`;
      dataset.entities.set(id, entity(id, 2));
      partition.communities.get("1")!.entityIds.push(id);
    }
    dataset.entities.set("x", entity("x", 2)); // 1 of 67
    expect(one(run(dataset, partition), "unclaimed").severity).toBe("watch");
  });

  it("says nothing at all when every entity is claimed", () => {
    const { dataset, partition } = healthy();
    expect(ids(run(dataset, partition))).not.toContain("unclaimed");
  });

  it("has no opinion without a community set", () => {
    const { dataset } = healthy();
    expect(ids(run(dataset, null))).not.toContain("unclaimed");
    expect(unclaimedEntities(dataset, null)).toEqual([]);
  });
});

describe("a community that stands for its whole level", () => {
  it("is named once, with the share it holds", () => {
    const { dataset } = healthy();
    const partition: Partition = {
      id: "p", label: "p", levels: [1], rootLevel: 1,
      communities: new Map([
        ["1", community("1", 1, ["a", "b", "c", "d"])],
        ["2", community("2", 1, ["e"])],
        ["3", community("3", 1, ["f"])],
      ]),
    };
    const finding = one(run(dataset, partition), "dominant-l1");
    expect(finding.severity).toBe("fix");
    expect(finding.vars).toMatchObject({ size: 4, covered: 6, share: "67%" });
  });

  it("says nothing when a level has too few communities to have a dominant one", () => {
    const { dataset } = healthy();
    const partition: Partition = {
      id: "p", label: "p", levels: [0], rootLevel: 0,
      communities: new Map([["0", community("0", 0, ["a", "b", "c", "d", "e", "f"])]]),
    };
    expect(ids(run(dataset, partition)).some((id) => id.startsWith("dominant"))).toBe(false);
  });
});

describe("communities global search cannot read", () => {
  it("counts the ones with no summary", () => {
    const { dataset, partition } = healthy();
    partition.communities.set("3", community("3", 1, [], false));
    const finding = one(run(dataset, partition), "no-reports");
    expect(finding.severity).toBe("fix");
    expect(finding.vars).toMatchObject({ count: 1, total: 3 });
  });
});

describe("whether the grouping follows the graph", () => {
  it("calls out a partition that cuts across it", () => {
    const { dataset } = healthy();
    // One entity from each triangle in each community: the worst split of this graph.
    const partition: Partition = {
      id: "p", label: "p", levels: [1], rootLevel: 1,
      communities: new Map([
        ["1", community("1", 1, ["a", "d"])],
        ["2", community("2", 1, ["b", "e"])],
        ["3", community("3", 1, ["c", "f"])],
      ]),
    };
    const finding = one(run(dataset, partition), "low-modularity");
    expect(finding.severity).toBe("fix");
    expect(ids(run(dataset, partition))).not.toContain("modularity-holds");
  });
});

describe("what local search has to rank on", () => {
  it("counts entities with nothing but a bare title", () => {
    const { dataset, partition } = healthy();
    for (const id of ["a", "b", "c", "d"]) dataset.entities.set(id, entity(id, 2, ""));
    const finding = one(run(dataset, partition), "thin-descriptions");
    expect(finding.severity).toBe("fix"); // 4 of 6
    expect(finding.affects).toBe("local");
  });

  it("stays quiet when the descriptions are there", () => {
    const { dataset, partition } = healthy();
    expect(ids(run(dataset, partition))).not.toContain("thin-descriptions");
  });

  it("notices relationships that say only that two things are connected", () => {
    const { dataset, partition } = healthy();
    dataset.relationships = dataset.relationships.map((r) => ({ ...r, description: "" }));
    expect(one(run(dataset, partition), "bare-relationships").vars).toMatchObject({ share: "100%", count: 7 });
  });
});

describe("one entity the graph hangs off", () => {
  /** A star: one centre, forty spokes, plus a rim so the spokes are not all isolated. */
  const star = (): { dataset: Dataset; partition: Partition } => {
    const spokes = Array.from({ length: 40 }, (_, i) => `s${i}`);
    const entities = new Map<string, Entity>([["hub", entity("hub", 40)]]);
    for (const id of spokes) entities.set(id, entity(id, 2));
    const relationships = spokes.map((id, i) => rel(`h${i}`, "hub", id));
    for (let i = 0; i + 1 < spokes.length; i += 2) relationships.push(rel(`r${i}`, spokes[i], spokes[i + 1]));
    const dataset: Dataset = {
      source: { kind: "graphrag", files: [] },
      entities,
      relationships,
      partitions: [],
      textUnits: new Map([["t1", chunk("t1")]]),
      documents: new Map(),
      covariates: [],
    };
    const partition: Partition = {
      id: "p", label: "p", levels: [1], rootLevel: 1,
      communities: new Map([
        ["1", community("1", 1, ["hub", ...spokes.slice(0, 20)])],
        ["2", community("2", 1, spokes.slice(20))],
      ]),
    };
    return { dataset, partition };
  };

  it("is named with the share of relationship ends it holds", () => {
    const { dataset, partition } = star();
    const finding = one(run(dataset, partition), "hub");
    expect(finding.vars.title).toBe("hub");
    expect(finding.severity).toBe("watch");
    expect(busiestEntity(dataset)?.title).toBe("hub");
  });

  it("says nothing about a graph too small for one node to stand out", () => {
    const { dataset, partition } = healthy();
    expect(ids(run(dataset, partition))).not.toContain("hub");
  });

  it("has nothing to say about a graph with no relationships", () => {
    const { dataset } = healthy();
    dataset.relationships = [];
    expect(busiestEntity({ ...dataset, entities: new Map([["a", entity("a", 0)]]) })).toBeNull();
  });
});

describe("what a citation can be followed to", () => {
  it("warns when no source text shipped", () => {
    const { dataset, partition } = healthy();
    dataset.textUnits = new Map();
    expect(one(run(dataset, partition), "no-text-units").affects).toBe("evidence");
  });
});

describe("whether local search can run", () => {
  it("says so when there are no vectors, and points at the tool", () => {
    const { dataset, partition } = healthy();
    const finding = one(run(dataset, partition, false), "no-embeddings");
    expect(finding.affects).toBe("local");
    expect(finding.fix).toContain("embed_index");
  });

  it("says nothing when the sidecar is loaded", () => {
    const { dataset, partition } = healthy();
    expect(ids(run(dataset, partition, true))).not.toContain("no-embeddings");
  });
});
