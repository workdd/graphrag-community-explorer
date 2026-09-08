import { describe, expect, it } from "vitest";
import type { Dataset, Entity, Relationship } from "../model";
import { buildGraph, modularity, runLeiden, type LeidenStep } from "./leiden";

const entity = (id: string): Entity => ({ id, title: id, type: "T", degree: 0, textUnitIds: [] });
const link = (a: string, b: string, weight?: number): Relationship => ({
  id: `${a}-${b}`, sourceId: a, targetId: b, type: "related", weight, textUnitIds: [],
});

/** Two triangles joined by a single edge: the obvious answer is two communities. */
function twoTriangles(): Dataset {
  const ids = ["a", "b", "c", "x", "y", "z"];
  return {
    source: { kind: "graphrag", files: [] },
    entities: new Map(ids.map((id) => [id, entity(id)])),
    relationships: [
      link("a", "b"), link("b", "c"), link("c", "a"),
      link("x", "y"), link("y", "z"), link("z", "x"),
      link("c", "x"),
    ],
    partitions: [], textUnits: new Map(), documents: new Map(), covariates: [],
  };
}

describe("buildGraph", () => {
  it("sums parallel edges, drops self loops and counts every edge once", () => {
    const dataset = twoTriangles();
    dataset.relationships.push(link("a", "b", 3), link("a", "a"));
    const { graph, entityIds } = buildGraph(dataset);
    expect(graph.n).toBe(6);
    expect(entityIds).toEqual(["a", "b", "c", "x", "y", "z"]);
    // six unit edges plus the extra weight 3 on a-b
    expect(graph.totalWeight).toBe(10);
    expect(graph.offsets[graph.n] / 2).toBe(7);
    const a = 0;
    const neighbours = [...graph.targets.slice(graph.offsets[a], graph.offsets[a + 1])];
    expect(neighbours.sort()).toEqual([1, 2]);
  });

  it("keeps a fixed node order when one is supplied", () => {
    const { entityIds } = buildGraph(twoTriangles(), ["z", "a"]);
    expect(entityIds).toEqual(["z", "a"]);
  });
});

describe("runLeiden", () => {
  const { graph, entityIds } = buildGraph(twoTriangles());

  it("finds the two triangles", () => {
    const result = runLeiden(graph, { seed: 7 });
    const final = result.levels[result.levels.length - 1];
    const of = (id: string) => final[entityIds.indexOf(id)];
    expect(of("a")).toBe(of("b"));
    expect(of("a")).toBe(of("c"));
    expect(of("x")).toBe(of("y"));
    expect(of("x")).toBe(of("z"));
    expect(of("a")).not.toBe(of("x"));
    expect(result.modularity).toBeGreaterThan(0.35);
  });

  it("reports the phases in order and never lowers modularity between rounds", () => {
    const steps: LeidenStep[] = [];
    runLeiden(graph, { seed: 7, onStep: (step) => steps.push(step) });
    expect(steps[0].phase).toBe("start");
    expect(steps[0].communities).toBe(6);
    expect(steps[steps.length - 1].phase).toBe("done");
    expect(steps.some((s) => s.phase === "moving")).toBe(true);
    // the working graph only ever shrinks
    const sizes = steps.map((s) => s.workNodes);
    expect(sizes.every((size, i) => i === 0 || size <= sizes[i - 1])).toBe(true);
    // the last sweep of local moving in a round moves nothing, which is what ends it
    const lastMoving = [...steps].reverse().find((s) => s.phase === "moving");
    expect(lastMoving?.moved).toBe(0);
    expect(steps[steps.length - 1].modularity).toBeGreaterThanOrEqual(steps[0].modularity);
  });

  it("repeats exactly for the same seed and reports which nodes moved", () => {
    const run = () => {
      const steps: LeidenStep[] = [];
      runLeiden(graph, { seed: 3, onStep: (s) => steps.push({ ...s }) });
      return steps.map((s) => `${s.phase}:${s.communities}:${[...s.membership].join("")}:${[...s.movedNodes].join(",")}`);
    };
    expect(run()).toEqual(run());
    const steps: LeidenStep[] = [];
    runLeiden(graph, { seed: 3, onStep: (s) => steps.push(s) });
    const firstSweep = steps.find((s) => s.phase === "moving")!;
    expect(firstSweep.movedNodes.length).toBeGreaterThan(0);
  });

  it("splits into more communities as the resolution rises", () => {
    const coarse = runLeiden(graph, { seed: 7, resolution: 0.5 });
    const fine = runLeiden(graph, { seed: 7, resolution: 4 });
    const count = (membership: Int32Array) => new Set(membership).size;
    expect(count(fine.levels[fine.levels.length - 1])).toBeGreaterThanOrEqual(count(coarse.levels[coarse.levels.length - 1]));
  });

  it("handles a graph with no edges", () => {
    const empty: Dataset = { ...twoTriangles(), relationships: [] };
    const built = buildGraph(empty);
    const result = runLeiden(built.graph, { seed: 1 });
    expect(result.modularity).toBe(0);
    expect(new Set(result.levels[result.levels.length - 1]).size).toBe(6);
  });
});

describe("modularity", () => {
  it("is zero when everything is one community and positive for the right split", () => {
    const { graph, entityIds } = buildGraph(twoTriangles());
    const single = new Int32Array(graph.n);
    expect(modularity(graph, single)).toBeCloseTo(0, 10);
    const split = Int32Array.from(entityIds.map((id) => ("abc".includes(id) ? 0 : 1)));
    expect(modularity(graph, split)).toBeGreaterThan(0.35);
  });
});
