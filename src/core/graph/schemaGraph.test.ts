import { describe, expect, it } from "vitest";
import type { Dataset, Entity, Relationship } from "../model";
import { exitsFrom, extendSelection, neighbourTypes, relationshipsOfType, samplesForTriple, samplesForType, schemaGraph, selectTriple, selectType, tripleId } from "./schemaGraph";

const entity = (id: string, type: string, degree = 0): Entity => ({ id, title: id.toUpperCase(), type, degree, textUnitIds: [] });
const rel = (id: string, sourceId: string, targetId: string, type: string): Relationship => ({ id, sourceId, targetId, type, textUnitIds: [] });

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([
    ["u1", entity("u1", "User", 3)], ["u2", entity("u2", "User", 1)],
    ["r1", entity("r1", "Role", 4)], ["m1", entity("m1", "Menu", 2)], ["m2", entity("m2", "Menu", 1)],
  ]),
  relationships: [
    rel("a", "u1", "r1", "hasRole"), rel("b", "u2", "r1", "hasRole"),
    rel("c", "r1", "m1", "grants"), rel("d", "r1", "m2", "grants"),
    rel("e", "m1", "m2", "parentOf"),
    rel("f", "u1", "gone", "hasRole"),
  ],
  partitions: [], textUnits: new Map(), documents: new Map(), covariates: [],
};

describe("schemaGraph", () => {
  const graph = schemaGraph(dataset);

  it("counts entity types and the triples that occur", () => {
    expect(graph.nodes.map((n) => `${n.type}:${n.entities}`)).toEqual(["Menu:2", "User:2", "Role:1"]);
    expect(graph.edges.map((e) => `${e.from}-${e.relationship}->${e.to}:${e.count}`)).toEqual([
      "Role-grants->Menu:2", "User-hasRole->Role:2", "Menu-parentOf->Menu:1",
    ]);
    expect(graph.edges.find((e) => e.id === tripleId("Menu", "parentOf", "Menu"))?.loop).toBe(true);
    expect(graph.dangling).toBe(1);
  });

  it("counts a relationship once for each type it touches", () => {
    const menu = graph.nodes.find((n) => n.type === "Menu")!;
    // two grants edges plus one parentOf, which starts and ends on Menu
    expect(menu.relationships).toBe(3);
  });

  it("gives the types and relationship names around one type", () => {
    expect(neighbourTypes(graph, "Role").sort()).toEqual(["Menu", "Role", "User"]);
    expect(relationshipsOfType(graph, "Role").sort()).toEqual(["grants", "hasRole"]);
    expect(neighbourTypes(graph, "Menu").sort()).toEqual(["Menu", "Role"]);
  });

  it("returns the real rows behind a triple and the busiest entities of a type", () => {
    const triple = graph.edges.find((e) => e.relationship === "grants")!;
    expect(samplesForTriple(dataset, triple).map((s) => `${s.source.title}->${s.target.title}`)).toEqual(["R1->M1", "R1->M2"]);
    expect(samplesForType(dataset, "User").map((e) => e.title)).toEqual(["U1", "U2"]);
    expect(samplesForTriple(dataset, triple, 1)).toHaveLength(1);
  });
});

describe("selections", () => {
  const graph = schemaGraph(dataset);

  it("takes a type with everything it touches", () => {
    const selection = selectType(graph, "Role");
    expect(selection.types.sort()).toEqual(["Menu", "Role", "User"]);
    expect(selection.relationships.sort()).toEqual(["grants", "hasRole"]);
    expect(selection.label).toBe("Role");
  });

  it("takes a triple on its own", () => {
    const edge = graph.edges.find((e) => e.relationship === "hasRole")!;
    expect(selectTriple(edge)).toEqual({ label: "User hasRole Role", types: ["User", "Role"], relationships: ["hasRole"] });
  });

  it("extends a selection along one more arrow and lists what is still outside", () => {
    const start = selectTriple(graph.edges.find((e) => e.relationship === "hasRole")!);
    expect(exitsFrom(graph, start).map((e) => e.relationship).sort()).toEqual(["grants"]);
    const wider = extendSelection(start, graph.edges.find((e) => e.relationship === "grants")!);
    expect(wider.types.sort()).toEqual(["Menu", "Role", "User"]);
    expect(wider.relationships.sort()).toEqual(["grants", "hasRole"]);
    // parentOf stays outside because both of its ends are already in, but its name is not
    expect(exitsFrom(graph, wider).map((e) => e.relationship)).toEqual(["parentOf"]);
  });
});
