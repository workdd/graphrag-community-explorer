import { describe, expect, it } from "vitest";
import { labelWidth, placeLabels, type LabelCandidate } from "./labels";

const at = (id: string, x: number, y: number, priority = 0, width = 80, height = 20): LabelCandidate => ({ id, x, y, width, height, priority });

describe("placeLabels", () => {
  it("keeps the higher priority name when two boxes collide", () => {
    const result = placeLabels([at("low", 100, 100, 1), at("high", 110, 104, 5)]);
    expect([...result.shown]).toEqual(["high"]);
    expect(result.dropped).toBe(1);
  });

  it("shows both when they are far enough apart", () => {
    const result = placeLabels([at("a", 0, 0), at("b", 300, 300)]);
    expect(result.shown.size).toBe(2);
    expect(result.dropped).toBe(0);
  });

  it("shows more names as the same graph spreads out", () => {
    const tight = [at("a", 0, 0), at("b", 40, 0), at("c", 80, 0), at("d", 120, 0)];
    const spread = tight.map((candidate, i) => ({ ...candidate, x: i * 200 }));
    expect(placeLabels(tight).shown.size).toBeLessThan(placeLabels(spread).shown.size);
    expect(placeLabels(spread).shown.size).toBe(4);
  });

  it("stops at the limit and counts what it left off", () => {
    const many = Array.from({ length: 10 }, (_, i) => at(`n${i}`, i * 500, 0));
    const result = placeLabels(many, 4);
    expect(result.shown.size).toBe(4);
    expect(result.dropped).toBe(6);
  });

  it("breaks ties the same way every time", () => {
    const first = placeLabels([at("b", 0, 0, 3), at("a", 0, 0, 3)]);
    const second = placeLabels([at("a", 0, 0, 3), at("b", 0, 0, 3)]);
    expect([...first.shown]).toEqual([...second.shown]);
  });

  it("has nothing to do with an empty graph", () => {
    expect(placeLabels([])).toEqual({ shown: new Set(), dropped: 0 });
  });
});

describe("labelWidth", () => {
  it("gives wide characters their own width", () => {
    expect(labelWidth("시스템", 10)).toBeGreaterThan(labelWidth("abc", 10));
  });

  it("grows with the text and the font", () => {
    expect(labelWidth("abcdef", 10)).toBeGreaterThan(labelWidth("abc", 10));
    expect(labelWidth("abc", 20)).toBeGreaterThan(labelWidth("abc", 10));
  });
});
