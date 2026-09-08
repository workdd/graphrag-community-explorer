import { describe, expect, it } from "vitest";
import { buildEvidenceGraph } from "./evidenceGraph";
import { emptyContext, type SearchContext } from "./types";

const withData = (over: Partial<SearchContext>): SearchContext => ({ ...emptyContext(), ...over });

const entity = (shortId: string, title: string, score?: number) => ({ id: `E${shortId}`, shortId, title, text: "", score });
const link = (shortId: string, source: string, target: string, type = "calls") => ({
  id: `R${shortId}`, shortId, title: `${source} → ${target}`, text: "",
  raw: { id: `R${shortId}`, source, target, type },
});

describe("buildEvidenceGraph", () => {
  it("turns ranked entities into nodes that keep their number and score", () => {
    const g = buildEvidenceGraph(withData({ entities: [entity("1", "Alpha", 0.8)] }));
    expect(g.nodes).toEqual([
      { id: "n:Alpha", label: "Alpha", kind: "seed", shortId: "1", recordId: "E1", score: 0.8 },
    ]);
  });

  it("draws a link between two ranked entities", () => {
    const g = buildEvidenceGraph(withData({
      entities: [entity("1", "Alpha"), entity("2", "Beta")],
      relationships: [link("1", "Alpha", "Beta")],
    }));
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ source: "n:Alpha", target: "n:Beta", label: "calls", shortId: "1" });
    expect(g.note).toBeNull();
  });

  it("keeps the far end of a link even when it was not ranked, and marks it as outside", () => {
    const g = buildEvidenceGraph(withData({
      entities: [entity("1", "Alpha")],
      relationships: [link("1", "Alpha", "Stranger")],
    }));
    expect(g.nodes.map((n) => [n.label, n.kind])).toEqual([["Alpha", "seed"], ["Stranger", "outside"]]);
  });

  it("skips a link with a missing or self-referencing end", () => {
    const g = buildEvidenceGraph(withData({
      entities: [entity("1", "Alpha")],
      relationships: [
        { id: "R9", shortId: "9", title: "broken", text: "", raw: { source: "", target: "Beta" } },
        link("2", "Alpha", "Alpha"),
      ],
    }));
    expect(g.edges).toEqual([]);
    expect(g.note).toBe("no-links");
  });

  it("says a global run carried summaries and nothing to draw", () => {
    const g = buildEvidenceGraph(withData({ reports: [{ id: "k1", shortId: "1", title: "Checkout", text: "" }] }));
    expect(g.nodes).toEqual([]);
    expect(g.note).toBe("reports-only");
  });

  it("says an empty context has nothing at all", () => {
    expect(buildEvidenceGraph(emptyContext()).note).toBe("none");
  });

  it("names an edge by its type, falling back to the item title", () => {
    const g = buildEvidenceGraph(withData({
      relationships: [{ id: "R1", shortId: "1", title: "A → B", text: "", raw: { source: "A", target: "B" } }],
    }));
    expect(g.edges[0].label).toBe("A → B");
  });
});
