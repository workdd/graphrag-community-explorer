import { describe, expect, it } from "vitest";
import { clusterLayout } from "./clusterLayout";

const group = (id: string, count: number) => ({ id, members: Array.from({ length: count }, (_, i) => `${id}-${i}`) });

describe("clusterLayout", () => {
  const layout = clusterLayout([group("a", 30), group("b", 8), group("c", 3)], { gap: 100 });

  it("gives every member a position", () => {
    expect(Object.keys(layout.positions)).toHaveLength(41);
    expect(layout.groups.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a real gap between two communities", () => {
    for (const one of layout.groups) {
      for (const other of layout.groups) {
        if (one.id === other.id) continue;
        const distance = Math.hypot(one.x - other.x, one.y - other.y);
        expect(distance).toBeGreaterThanOrEqual(one.radius + other.radius);
      }
    }
  });

  it("keeps a community's members inside its own disc", () => {
    for (const entry of layout.groups) {
      for (let i = 0; i < entry.members; i++) {
        const point = layout.positions[`${entry.id}-${i}`];
        expect(Math.hypot(point.x - entry.x, point.y - entry.y)).toBeLessThanOrEqual(entry.radius);
      }
    }
  });

  it("gives a bigger community a bigger disc", () => {
    const [a, b, c] = layout.groups;
    expect(a.radius).toBeGreaterThan(b.radius);
    expect(b.radius).toBeGreaterThan(c.radius);
  });

  it("wraps to a new row rather than running off the side", () => {
    const many = clusterLayout(Array.from({ length: 12 }, (_, i) => group(`g${i}`, 20)), { targetWidth: 600 });
    expect(many.width).toBeLessThanOrEqual(700);
    expect(many.height).toBeGreaterThan(many.groups[0].radius * 2);
  });

  it("repeats exactly for the same input", () => {
    const again = clusterLayout([group("a", 30), group("b", 8), group("c", 3)], { gap: 100 });
    expect(again.positions).toEqual(layout.positions);
  });

  it("ignores empty communities", () => {
    expect(clusterLayout([{ id: "empty", members: [] }]).groups).toEqual([]);
  });
});
