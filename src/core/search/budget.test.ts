import { describe, expect, it } from "vitest";
import { clip, estimateTokens, fill } from "./budget";

describe("estimateTokens", () => {
  it("is zero for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("counts Latin text at about four characters a token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("counts Hangul at about one token a character", () => {
    expect(estimateTokens("커뮤니티")).toBe(4);
  });

  it("adds the two kinds together", () => {
    expect(estimateTokens("커뮤니티abcd")).toBe(5);
  });

  it("charges a token for each symbol, the way a tokenizer splits them", () => {
    expect(estimateTokens("{}")).toBe(2);
    expect(estimateTokens('{"a": 1}')).toBe(7); // { " a " : 1 }
  });

  it("does not charge for the spaces between words", () => {
    expect(estimateTokens("abcd abcd")).toBe(2);
  });

  it("counts a short run as a whole token", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("prices property JSON well above four characters a token", () => {
    const json = '{"id": "d980bc1e-7f3f-472c-880a-4f4a714448ee", "kind": "Cluster"}';
    expect(estimateTokens(json)).toBeGreaterThan(json.length / 4);
  });
});

describe("fill", () => {
  const cost = (n: number) => n;

  it("takes everything when the budget is large enough", () => {
    const r = fill([{ key: "a", items: [1, 2] }], cost, 10);
    expect(r.groups[0].taken).toEqual([1, 2]);
    expect(r.truncated).toBe(false);
    expect(r.tokens).toBe(3);
  });

  it("serves the first group before the second", () => {
    const r = fill([{ key: "a", items: [6] }, { key: "b", items: [6] }], cost, 8);
    expect(r.groups[0].taken).toEqual([6]);
    expect(r.groups[1].taken).toEqual([]);
    expect(r.groups[1].dropped).toBe(1);
    expect(r.truncated).toBe(true);
  });

  it("keeps taking smaller items after one does not fit", () => {
    const r = fill([{ key: "a", items: [9, 1] }], cost, 5);
    expect(r.groups[0].taken).toEqual([1]);
    expect(r.groups[0].dropped).toBe(1);
  });

  it("takes nothing when the budget is zero", () => {
    const r = fill([{ key: "a", items: [1] }], cost, 0);
    expect(r.groups[0].taken).toEqual([]);
    expect(r.truncated).toBe(true);
  });

  it("reports every group even when empty", () => {
    const r = fill([{ key: "a", items: [] }], cost, 10);
    expect(r.groups).toHaveLength(1);
    expect(r.truncated).toBe(false);
  });
});

describe("clip", () => {
  it("leaves short text alone", () => {
    expect(clip("abcd", 10)).toBe("abcd");
  });

  it("cuts long text and marks it", () => {
    const out = clip("가".repeat(50), 10);
    expect(out.endsWith("…")).toBe(true);
    expect(estimateTokens(out)).toBeLessThanOrEqual(11);
  });
});
