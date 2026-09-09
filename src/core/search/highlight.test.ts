import { describe, expect, it } from "vitest";
import { citedShortIds, countUsage, sameSelection } from "./highlight";
import { emptyContext, type SearchContext } from "./types";

const item = (shortId: string) => ({ shortId, title: `T${shortId}`, text: "" });
const context: SearchContext = {
  ...emptyContext(),
  entities: [item("1"), item("2"), item("3")],
  relationships: [item("1"), item("2")],
  reports: [item("1")],
};

describe("citedShortIds", () => {
  it("collects the numbers the answer pointed at", () => {
    const out = citedShortIds("답 [Data: Entities (1, 3); Reports (1)] 끝", context);
    expect([...out.entities]).toEqual(["1", "3"]);
    expect([...out.reports]).toEqual(["1"]);
    expect([...out.relationships]).toEqual([]);
  });

  it("reads a citation written without the Data prefix", () => {
    expect([...citedShortIds("x [Relationships (2)]", context).relationships]).toEqual(["2"]);
  });

  it("drops a number that is not in the context", () => {
    expect([...citedShortIds("x [Data: Entities (9)]", context).entities]).toEqual([]);
  });

  it("drops a kind it does not know", () => {
    const out = citedShortIds("x [Data: Widgets (1)]", context);
    expect(countUsage(context, out).cited).toBe(0);
  });

  it("counts a number cited twice once", () => {
    const out = citedShortIds("a [Data: Entities (1)] b [Data: Entities (1)]", context);
    expect([...out.entities]).toEqual(["1"]);
  });

  it("finds nothing in an answer that cited nothing", () => {
    expect(countUsage(context, citedShortIds("근거 없이 쓴 답", context)).cited).toBe(0);
  });
});

describe("countUsage", () => {
  it("reports what was used against what was retrieved", () => {
    const cited = citedShortIds("x [Data: Entities (1, 2); Reports (1)]", context);
    expect(countUsage(context, cited)).toEqual({ cited: 3, retrieved: 6 });
  });

  it("counts an empty context as nothing on both sides", () => {
    const bare = emptyContext();
    expect(countUsage(bare, citedShortIds("", bare))).toEqual({ cited: 0, retrieved: 0 });
  });
});

describe("sameSelection", () => {
  it("matches on kind and number together", () => {
    expect(sameSelection({ kind: "entities", shortId: "1" }, { kind: "entities", shortId: "1" })).toBe(true);
    expect(sameSelection({ kind: "entities", shortId: "1" }, { kind: "reports", shortId: "1" })).toBe(false);
    expect(sameSelection({ kind: "entities", shortId: "1" }, { kind: "entities", shortId: "2" })).toBe(false);
  });

  it("treats nothing selected as equal to nothing selected", () => {
    expect(sameSelection(null, null)).toBe(true);
    expect(sameSelection(null, { kind: "entities", shortId: "1" })).toBe(false);
  });
});
