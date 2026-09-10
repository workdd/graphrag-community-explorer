import { describe, expect, it } from "vitest";
import { rowIsTabbable } from "./rowKeys";

describe("which row carries the tab stop", () => {
  const ids = ["a", "b", "c"];

  it("is the selected one", () => {
    expect(rowIsTabbable(1, "b", "b", ids)).toBe(true);
    expect(rowIsTabbable(0, "a", "b", ids)).toBe(false);
  });

  it("is the first one when nothing is selected", () => {
    expect(rowIsTabbable(0, "a", null, ids)).toBe(true);
    expect(rowIsTabbable(1, "b", null, ids)).toBe(false);
  });

  it("is the first one when the selection was filtered out", () => {
    // Sorting or filtering must never leave a table with no way in.
    expect(rowIsTabbable(0, "a", "z", ids)).toBe(true);
    expect(rowIsTabbable(2, "c", "z", ids)).toBe(false);
  });

  it("gives exactly one stop, whatever the selection", () => {
    for (const selected of [null, "a", "c", "z"]) {
      const stops = ids.filter((id, i) => rowIsTabbable(i, id, selected, ids));
      expect(stops).toHaveLength(1);
    }
  });
});
