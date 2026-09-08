import { describe, expect, it } from "vitest";
import { HIDE_LABEL_BELOW_PX, labelVisible, LABEL_FONT_PX, LEGIBLE_ZOOM, MIN_LABEL_PX, zoomAfterFit } from "./legibility";

describe("legibility thresholds", () => {
  it("keeps the first view above the hide threshold", () => {
    expect(LEGIBLE_ZOOM * LABEL_FONT_PX).toBeGreaterThan(HIDE_LABEL_BELOW_PX);
    expect(LEGIBLE_ZOOM * LABEL_FONT_PX).toBe(MIN_LABEL_PX);
  });
});

describe("zoomAfterFit", () => {
  it("leaves a fit that is already legible alone", () => {
    expect(zoomAfterFit(1.4, 6)).toBe(1.4);
  });

  it("raises a fit that would draw unreadable labels", () => {
    expect(zoomAfterFit(0.42, 6)).toBe(LEGIBLE_ZOOM);
  });

  it("never exceeds the map's own maximum", () => {
    expect(zoomAfterFit(0.1, 0.5)).toBe(0.5);
  });

  it("survives a fit that produced nothing usable", () => {
    expect(zoomAfterFit(0, 6)).toBe(LEGIBLE_ZOOM);
    expect(zoomAfterFit(Number.NaN, 6)).toBe(LEGIBLE_ZOOM);
  });
});

describe("labelVisible", () => {
  it("shows labels at the opening zoom", () => {
    expect(labelVisible(LEGIBLE_ZOOM)).toBe(true);
  });

  it("hides them once the reader has zoomed well out", () => {
    expect(labelVisible(0.42)).toBe(false);
    expect(labelVisible(0.2)).toBe(false);
  });
});
