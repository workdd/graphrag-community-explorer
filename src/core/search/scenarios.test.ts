import { describe, expect, it } from "vitest";
import type { Dataset, Entity, Relationship } from "../model";
import { testScenarios } from "./scenarios";
const e = (id: string, type: string): Entity => ({ id, type, title: `${type} · fixture-${id}`, degree: 1, textUnitIds: [] });
const r = (sourceId: string, targetId: string, type: string): Relationship => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, type, textUnitIds: [] });
const make = (entities: Entity[], relationships: Relationship[] = []): Dataset => ({ source: { kind: "age-export", files: [] }, entities: new Map(entities.map(e => [e.id, e])), relationships, partitions: [], textUnits: new Map(), documents: new Map(), covariates: [] });
describe("testScenarios", () => {
  it("uses only the resource cases on a resource index and includes a real three-hop start", () => {
    const data = make([e("vm", "VirtualMachine"), e("disk", "BlockStorage"), e("snap", "BlockStorageSnapshot"), e("p", "Project"), e("n", "Node")], [r("snap", "disk", "snapshotOfVolume"), r("disk", "vm", "attachedToVM"), r("vm", "p", "belongsToProject")]);
    const cases = testScenarios(data, "ko");
    expect(cases).toHaveLength(12);
    expect(cases.every(c => c.domain === "resource")).toBe(true);
    expect(cases.find(c => c.id === "RL3")?.question).toContain("fixture-snap");
    expect(cases.filter(c => c.method === "global")).toHaveLength(6);
  });
  it("does not offer a three-hop example when the chain is incomplete", () => {
    const data = make([e("vm", "VirtualMachine"), e("snap", "BlockStorageSnapshot")], [r("snap", "missing", "snapshotOfVolume")]);
    expect(testScenarios(data, "ko").some(c => c.id === "RL3")).toBe(false);
  });
  it("separates governance and marks rule uncertainty as a boundary case", () => {
    const data = make([e("u", "User"), e("r", "Role"), e("l", "Label"), e("w", "Workspace")], [r("u", "l", "administersLabel"), r("l", "w", "assignedTo")]);
    const cases = testScenarios(data, "en");
    expect(cases).toHaveLength(12);
    expect(cases.every(c => c.domain === "governance")).toBe(true);
    expect(cases.find(c => c.id === "GL4")?.question).toContain("fixture-u");
    expect(cases.find(c => c.id === "GL5")?.boundary).toBe(true);
    expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
  });
  it("does not inject CMP questions into an unrelated index", () => {
    expect(testScenarios(make([e("x", "Person")]), "ko")).toEqual([]);
  });
});
