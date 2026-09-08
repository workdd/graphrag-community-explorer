import { describe, expect, it } from "vitest";
import type { Community, Partition } from "../model";
import { batchReports, collectReports, DEFAULT_GLOBAL, parseMapPoints, rankPoints, renderBatch, renderPoints, type ReportRef } from "./global";

const community = (id: string, level: number, rank: number, summary: string): Community => ({
  id, level, parentId: null, childIds: [], title: `C${id}`, entityIds: [], relationshipIds: [],
  size: 1, membershipSource: "entity_ids", textUnitIds: [], report: { summary, findings: [], rank },
});

const partition: Partition = {
  id: "p", label: "p", levels: [0, 1], rootLevel: 0,
  communities: new Map([
    ["a", community("a", 0, 5, "Alpha summary.")],
    ["b", community("b", 0, 9, "Beta summary.")],
    ["c", community("c", 1, 1, "Gamma summary.")],
    ["d", { ...community("d", 0, 3, ""), report: undefined }],
  ]),
};

describe("collectReports", () => {
  it("orders by rank and numbers from one", () => {
    const reports = collectReports(partition, DEFAULT_GLOBAL);
    expect(reports.map((r) => r.title)).toEqual(["Cb", "Ca", "Cc"]);
    expect(reports.map((r) => r.shortId)).toEqual(["1", "2", "3"]);
  });

  it("skips communities without a report", () => {
    expect(collectReports(partition, DEFAULT_GLOBAL).map((r) => r.id)).not.toContain("d");
  });

  it("takes one level when asked", () => {
    expect(collectReports(partition, { ...DEFAULT_GLOBAL, level: 1 }).map((r) => r.id)).toEqual(["c"]);
  });

  it("returns nothing without a partition", () => {
    expect(collectReports(null, DEFAULT_GLOBAL)).toEqual([]);
  });
});

const ref = (id: string, tokens: number): ReportRef => ({ id, shortId: id, title: id, text: id, tokens, level: 0 });

describe("batchReports", () => {
  it("keeps a batch under the budget", () => {
    const batches = batchReports([ref("1", 4), ref("2", 4), ref("3", 4)], 8);
    expect(batches.map((b) => b.length)).toEqual([2, 1]);
  });

  it("gives one oversized report its own batch", () => {
    const batches = batchReports([ref("1", 2), ref("2", 100)], 8);
    expect(batches.map((b) => b.map((r) => r.id))).toEqual([["1"], ["2"]]);
  });

  it("returns nothing for no reports", () => {
    expect(batchReports([], 8)).toEqual([]);
  });

  it("renders a batch with its numbers", () => {
    expect(renderBatch([{ ...ref("1", 1), text: "Alpha" }])).toBe("1. Alpha");
  });
});

describe("parseMapPoints", () => {
  it("reads well formed JSON", () => {
    const points = parseMapPoints('{"points":[{"description":"p","score":80,"reports":["1","2"]}]}');
    expect(points).toEqual([{ description: "p", score: 80, reports: ["1", "2"] }]);
  });

  it("reads JSON wrapped in a fenced block", () => {
    const points = parseMapPoints('```json\n{"points":[{"description":"p","score":1,"reports":[]}]}\n```');
    expect(points).toHaveLength(1);
  });

  it("returns nothing for unparseable text", () => {
    expect(parseMapPoints("sorry, I cannot")).toEqual([]);
  });

  it("returns nothing when points is missing or not a list", () => {
    expect(parseMapPoints('{"points":"none"}')).toEqual([]);
    expect(parseMapPoints("{}")).toEqual([]);
  });

  it("drops entries with no description and defaults a missing score", () => {
    const points = parseMapPoints('{"points":[{"description":"","score":9},{"description":"p"}]}');
    expect(points).toEqual([{ description: "p", score: 0, reports: [] }]);
  });

  it("turns report numbers into strings", () => {
    expect(parseMapPoints('{"points":[{"description":"p","score":1,"reports":[3]}]}')[0].reports).toEqual(["3"]);
  });
});

describe("rankPoints and renderPoints", () => {
  it("keeps the highest scoring points", () => {
    const points = rankPoints([
      { description: "low", score: 1, reports: [] },
      { description: "high", score: 9, reports: [] },
    ], 1);
    expect(points.map((p) => p.description)).toEqual(["high"]);
  });

  it("keeps nothing when the limit is zero", () => {
    expect(rankPoints([{ description: "x", score: 1, reports: [] }], 0)).toEqual([]);
  });

  it("renders points with their citations", () => {
    expect(renderPoints([{ description: "p", score: 1, reports: ["1", "2"] }])).toBe("- p [Data: Reports (1, 2)]");
  });
});
