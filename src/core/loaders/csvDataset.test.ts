import { describe, expect, it } from "vitest";
import { buildCsvDataset } from "./csvDataset";

const nodes = `id,name,type,description
a,Alpha,Service,serves carts
b,Beta,Database,stores orders
c,Gamma,Service,`;

const edges = `source,target,type,weight
a,b,reads,3
a,c,calls,`;

describe("a graph from two tables", () => {
  it("reads the nodes and the edges", () => {
    const { dataset } = buildCsvDataset({ nodes, edges });
    expect(dataset.entities.size).toBe(3);
    expect(dataset.relationships).toHaveLength(2);
    expect(dataset.entities.get("a")).toMatchObject({ title: "Alpha", type: "Service", description: "serves carts", degree: 2 });
    expect(dataset.relationships[0]).toMatchObject({ sourceId: "a", targetId: "b", type: "reads", weight: 3 });
  });

  it("counts degree from the edges that survived", () => {
    const { dataset } = buildCsvDataset({ nodes, edges });
    expect(dataset.entities.get("b")?.degree).toBe(1);
    expect(dataset.entities.get("c")?.degree).toBe(1);
  });

  it("leaves the GraphRAG half of the contract empty rather than faking it", () => {
    const { dataset } = buildCsvDataset({ nodes, edges });
    expect(dataset.partitions).toEqual([]);
    expect(dataset.textUnits.size).toBe(0);
    expect(dataset.covariates).toEqual([]);
    expect(dataset.source.kind).toBe("csv");
  });

  it("says which header it read as what", () => {
    const { notes } = buildCsvDataset({ nodes, edges });
    expect(notes.join(" ")).toContain('source from "source"');
    expect(notes.join(" ")).toContain('type from "type"');
  });
});

describe("a graph from one table", () => {
  it("takes the nodes from the ends of the edges", () => {
    const { dataset, notes } = buildCsvDataset({ edges: "source,target\nx,y\ny,z" });
    expect([...dataset.entities.keys()].sort()).toEqual(["x", "y", "z"]);
    expect(dataset.entities.get("y")?.degree).toBe(2);
    expect(notes.join(" ")).toContain("the nodes are the ends of the edges");
  });

  it("reads a bare edge list with no recognisable headers", () => {
    const { dataset } = buildCsvDataset({ edges: "from_thing,to_thing\np,q" });
    expect(dataset.relationships).toHaveLength(1);
    expect(dataset.entities.size).toBe(2);
  });
});

describe("what a table gets wrong", () => {
  it("drops an edge naming a node the node table does not have, and counts it", () => {
    const { dataset, notes } = buildCsvDataset({ nodes: "id\na\nb", edges: "source,target\na,b\na,zzz" });
    expect(dataset.relationships).toHaveLength(1);
    expect(notes.join(" ")).toContain("1 edges named a node the node table does not have");
  });

  it("merges a repeated node id rather than making two nodes", () => {
    const { dataset, notes } = buildCsvDataset({ nodes: "id,name\na,First\na,Second", edges: "source,target\na,a" });
    expect(dataset.entities.size).toBe(1);
    expect(dataset.entities.get("a")?.title).toBe("First");
    expect(notes.join(" ")).toContain("repeated an id");
  });

  it("has nothing to say about an empty edge table", () => {
    const { dataset } = buildCsvDataset({ edges: "" });
    expect(dataset.entities.size).toBe(0);
    expect(dataset.relationships).toEqual([]);
  });
});
