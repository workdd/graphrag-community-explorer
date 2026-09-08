import { describe, expect, it } from "vitest";
import { parseCitations, splitByCitations } from "./citations";

describe("parseCitations", () => {
  it("reads one group", () => {
    const [block] = parseCitations("Answer [Data: Entities (3, 7)].");
    expect(block.citations).toEqual([{ kind: "entities", label: "Entities", ids: ["3", "7"], more: false }]);
  });

  it("reads several kinds in one block", () => {
    const [block] = parseCitations("x [Data: Entities (1); Reports (2, 9)] y");
    expect(block.citations.map((c) => c.kind)).toEqual(["entities", "reports"]);
    expect(block.citations[1].ids).toEqual(["2", "9"]);
  });

  it("accumulates when the same kind appears twice in one block", () => {
    const [block] = parseCitations("x [Data: Entities (1, 2); Entities (5)] y");
    expect(block.citations).toHaveLength(1);
    expect(block.citations[0].ids).toEqual(["1", "2", "5"]);
  });

  it("marks +more without treating it as an id", () => {
    const [block] = parseCitations("x [Data: Reports (2, 7, +more)]");
    expect(block.citations[0].ids).toEqual(["2", "7"]);
    expect(block.citations[0].more).toBe(true);
  });

  it("keeps an unknown group as text with a null kind", () => {
    const [block] = parseCitations("x [Data: Widgets (4)]");
    expect(block.citations[0].kind).toBeNull();
    expect(block.citations[0].label).toBe("Widgets");
  });

  it("handles an empty group", () => {
    const [block] = parseCitations("x [Data: Entities ()]");
    expect(block.citations[0].ids).toEqual([]);
  });

  it("maps text units onto sources", () => {
    const [block] = parseCitations("x [Data: Text Units (1)]");
    expect(block.citations[0].kind).toBe("sources");
  });

  it("finds every block in a paragraph", () => {
    const blocks = parseCitations("a [Data: Entities (1)] b [Data: Reports (2)] c");
    expect(blocks).toHaveLength(2);
  });

  it("returns nothing when there is no citation", () => {
    expect(parseCitations("plain answer")).toEqual([]);
  });
});

describe("splitByCitations", () => {
  it("keeps the text around the blocks", () => {
    const parts = splitByCitations("a [Data: Entities (1)] b");
    expect(parts.map((p) => p.kind)).toEqual(["text", "citation", "text"]);
    expect(parts[0]).toEqual({ kind: "text", text: "a " });
    expect(parts[2]).toEqual({ kind: "text", text: " b" });
  });

  it("returns one text run when nothing is cited", () => {
    expect(splitByCitations("plain")).toEqual([{ kind: "text", text: "plain" }]);
  });

  it("returns nothing for an empty answer", () => {
    expect(splitByCitations("")).toEqual([]);
  });
});

describe("a citation written without the Data prefix", () => {
  it("is read when every group names a kind we know", () => {
    const [block] = parseCitations("영향 [Entities (2); Relationships (1)] 있습니다");
    expect(block.citations.map((c) => c.kind)).toEqual(["entities", "relationships"]);
    expect(block.citations[1].ids).toEqual(["1"]);
  });

  it("is read for a single known group", () => {
    expect(parseCitations("x [Relationships (3)]")[0].citations[0].kind).toBe("relationships");
  });

  it("leaves ordinary bracketed prose alone", () => {
    expect(parseCitations("문장 [참고 (1)] 끝")).toEqual([]);
    expect(parseCitations("코드 [see note] 끝")).toEqual([]);
    expect(parseCitations("배열 [1, 2, 3]")).toEqual([]);
  });

  it("leaves a bracket alone when only some groups are known", () => {
    expect(parseCitations("x [Entities (1); Widgets (2)]")).toEqual([]);
  });

  it("still reads a labelled block whose kind is unknown", () => {
    const [block] = parseCitations("x [Data: Widgets (4)]");
    expect(block.citations[0].label).toBe("Widgets");
  });

  it("splits a paragraph that mixes both forms", () => {
    const blocks = parseCitations("a [Data: Entities (1)] b [Reports (2)] c");
    expect(blocks).toHaveLength(2);
    expect(blocks[1].citations[0].kind).toBe("reports");
  });
});
