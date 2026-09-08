import { describe, expect, it } from "vitest";
import type { Dataset, Entity, Relationship } from "../model";
import { egoEntities, egoSummary, groupKey } from "./ego";

const entity = (id: string, type: string, degree = 0): Entity => ({ id, title: id, type, degree, textUnitIds: [] });
const rel = (id: string, sourceId: string, targetId: string, type: string): Relationship => ({ id, sourceId, targetId, type, textUnitIds: [] });

// One role granting eight menus, held by two users, and one menu it also reads.
const menus = Array.from({ length: 8 }, (_, i) => entity(`m${i}`, "Menu", 8 - i));
const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([
    ["r1", entity("r1", "Role", 11)], ["u1", entity("u1", "User", 4)], ["u2", entity("u2", "User", 2)],
    ...menus.map((m) => [m.id, m] as const),
  ]),
  relationships: [
    ...menus.map((m, i) => rel(`g${i}`, "r1", m.id, "grants")),
    rel("h1", "u1", "r1", "hasRole"), rel("h2", "u2", "r1", "hasRole"),
    rel("read", "r1", "m0", "reads"),
  ],
  partitions: [], textUnits: new Map(), documents: new Map(), covariates: [],
};

describe("egoSummary", () => {
  it("names a few of each group and counts the rest", () => {
    const model = egoSummary(dataset, "r1")!;
    expect(model.seed.id).toBe("r1");
    expect(model.neighbours).toBe(10);
    expect(model.relationships).toBe(11);
    const grants = model.groups[0];
    expect(grants.key).toBe(groupKey("out", "grants", "Menu"));
    expect(grants.total).toBe(8);
    // busiest first, three named, five kept as a count
    expect(grants.shown.map((e) => e.id)).toEqual(["m0", "m1", "m2"]);
    expect(grants.hidden).toBe(5);
  });

  it("separates the direction and the relationship", () => {
    const model = egoSummary(dataset, "r1")!;
    const keys = model.groups.map((g) => g.key);
    expect(keys).toContain(groupKey("in", "hasRole", "User"));
    expect(keys).toContain(groupKey("out", "reads", "Menu"));
    const held = model.groups.find((g) => g.key === groupKey("in", "hasRole", "User"))!;
    expect(held.shown.map((e) => e.id)).toEqual(["u1", "u2"]);
    expect(held.hidden).toBe(0);
  });

  it("opens one group without opening the others", () => {
    const model = egoSummary(dataset, "r1", { opened: new Set([groupKey("out", "grants", "Menu")]) })!;
    const grants = model.groups.find((g) => g.key === groupKey("out", "grants", "Menu"))!;
    expect(grants.shown).toHaveLength(8);
    expect(grants.hidden).toBe(0);
  });

  it("shows everything when the caller asks for it", () => {
    const model = egoSummary(dataset, "r1", { perGroup: Number.MAX_SAFE_INTEGER })!;
    expect(model.groups.every((group) => group.hidden === 0)).toBe(true);
    expect(egoEntities(model)).toHaveLength(11);
  });

  it("draws the seed and each named neighbour once", () => {
    const model = egoSummary(dataset, "r1")!;
    const drawn = egoEntities(model);
    expect(drawn[0].id).toBe("r1");
    // m0 is reached by both grants and reads but is only drawn once
    expect(drawn.filter((e) => e.id === "m0")).toHaveLength(1);
  });

  it("returns nothing for an entity that is not in the index", () => {
    expect(egoSummary(dataset, "gone")).toBeNull();
  });

  it("handles a record with no relationships", () => {
    const alone: Dataset = { ...dataset, relationships: [] };
    const model = egoSummary(alone, "r1")!;
    expect(model.groups).toEqual([]);
    expect(model.neighbours).toBe(0);
  });
});
