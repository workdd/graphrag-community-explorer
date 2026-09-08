import { describe, expect, it } from "vitest";
import type { Dataset, Entity, Relationship } from "../model";
import { schemaGraph } from "./schemaGraph";
import { buildMatrix, groupsForTriple } from "./matrix";

const entity = (id: string, type: string, degree = 0): Entity => ({ id, title: id, type, degree, textUnitIds: [] });
const rel = (id: string, sourceId: string, targetId: string, type: string): Relationship => ({ id, sourceId, targetId, type, textUnitIds: [] });

// Two roles over three menus with two kinds of grant, plus a star of volumes on one project.
const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([
    ["r1", entity("r1", "Role")], ["r2", entity("r2", "Role")],
    ["m1", entity("m1", "Menu")], ["m2", entity("m2", "Menu")], ["m3", entity("m3", "Menu")],
    ["p1", entity("p1", "Project")], ["v1", entity("v1", "Volume")], ["v2", entity("v2", "Volume")], ["v3", entity("v3", "Volume")],
  ]),
  relationships: [
    rel("a", "r1", "m1", "full"), rel("b", "r1", "m2", "read"), rel("c", "r2", "m2", "full"),
    rel("d", "r1", "m1", "read"), rel("e", "r2", "m3", "read"),
    rel("f", "v1", "p1", "belongsTo"), rel("g", "v2", "p1", "belongsTo"), rel("h", "v3", "p1", "belongsTo"),
  ],
  partitions: [], textUnits: new Map(), documents: new Map(), covariates: [],
};

describe("buildMatrix", () => {
  const matrix = buildMatrix(dataset, "Role", "Menu", ["full", "read"]);
  const at = (row: string, col: string) => {
    const r = matrix.rows.findIndex((e) => e.id === row);
    const c = matrix.cols.findIndex((e) => e.id === col);
    return matrix.cells.get(r * matrix.cols.length + c) ?? 0;
  };

  it("puts the busiest rows and columns first", () => {
    expect(matrix.rows.map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(matrix.cols.map((e) => e.id)).toEqual(["m2", "m1", "m3"]);
    expect(matrix.rowsTotal).toBe(2);
    expect(matrix.colsTotal).toBe(3);
  });

  it("keeps every relationship of a pair in one cell", () => {
    expect(at("r1", "m1")).toBe(0b11);
    expect(at("r1", "m2")).toBe(0b10);
    expect(at("r2", "m3")).toBe(0b10);
    expect(at("r2", "m1")).toBe(0);
    expect(matrix.pairs).toBe(4);
  });

  it("cuts to the limits and still reports the totals", () => {
    const small = buildMatrix(dataset, "Role", "Menu", ["full", "read"], { rows: 1, cols: 1 });
    expect(small.rows).toHaveLength(1);
    expect(small.cols).toHaveLength(1);
    expect(small.rowsTotal).toBe(2);
    expect(small.colsTotal).toBe(3);
  });

  it("returns nothing for a pair with no relationships of those names", () => {
    const empty = buildMatrix(dataset, "Role", "Project", ["full"]);
    expect(empty.rows).toHaveLength(0);
    expect(empty.pairs).toBe(0);
  });
});

describe("groupsForTriple", () => {
  const graph = schemaGraph(dataset);

  it("counts on the end with fewer entities", () => {
    const grouping = groupsForTriple(dataset, graph.edges.find((e) => e.relationship === "belongsTo")!);
    expect(grouping.by).toBe("target");
    expect(grouping.groups.map((g) => `${g.entity.id}:${g.count}`)).toEqual(["p1:3"]);
    expect(grouping.distinct).toBe(1);
    expect(grouping.fanOut).toBe(3);
  });

  it("counts on the source when that end is smaller", () => {
    const grouping = groupsForTriple(dataset, graph.edges.find((e) => e.relationship === "read")!);
    expect(grouping.by).toBe("source");
    expect(grouping.groups.map((g) => g.entity.id)).toEqual(["r1", "r2"]);
  });
});

describe("density", () => {
  it("marks the block that fills most of its possible pairs", () => {
    const graph = schemaGraph(dataset);
    const read = graph.edges.find((e) => e.relationship === "read")!;
    // two roles by three menus is six possible pairs, and three read grants exist
    expect(read.possible).toBe(6);
    expect(read.density).toBeCloseTo(0.5, 5);
    const belongs = graph.edges.find((e) => e.relationship === "belongsTo")!;
    expect(belongs.possible).toBe(3);
    expect(belongs.density).toBe(1);
  });
});
