import { describe, expect, it } from "vitest";
import type { Community, Partition } from "../model";
import { bandLayout } from "./bands";

const community = (id: string, level: number, parentId: string | null, entities: number): Community => ({
  id,
  level,
  parentId,
  childIds: [],
  title: `C${id}`,
  entityIds: Array.from({ length: entities }, (_, i) => `${id}-${i}`),
  relationshipIds: [],
  size: entities,
  membershipSource: "entity_ids",
  textUnitIds: [],
});

// Two roots at level 0, three children at level 1.
const partition: Partition = {
  id: "p",
  label: "p",
  rootLevel: 0,
  levels: [0, 1],
  communities: new Map([
    ["a", community("a", 0, null, 100)],
    ["b", community("b", 0, null, 25)],
    ["a1", community("a1", 1, "a", 60)],
    ["a2", community("a2", 1, "a", 30)],
    ["b1", community("b1", 1, "b", 10)],
  ]),
};

describe("bandLayout", () => {
  const model = bandLayout(partition, { width: 600, bandHeight: 100 });

  it("puts one band per level, root first", () => {
    expect(model.bands.map((band) => `L${band.depth}:${band.communities}:${band.entities}`)).toEqual(["L0:2:125", "L1:3:100"]);
    expect(model.bands[0].y).toBe(0);
    expect(model.bands[1].y).toBe(100);
    expect(model.height).toBe(200);
  });

  it("sizes a circle by how many entities it holds", () => {
    const a = model.circles.find((circle) => circle.id === "a")!;
    const b = model.circles.find((circle) => circle.id === "b")!;
    expect(a.size).toBe(100);
    expect(a.r).toBeGreaterThan(b.r);
    // the biggest community reaches the top of the scale
    expect(a.r).toBeCloseTo(34, 5);
  });

  it("leaves room for the name, not just the circle", () => {
    const withTitles = (titles: string[]): Partition => ({
      ...partition,
      levels: [0],
      communities: new Map(titles.map((title, i) => [`c${i}`, { ...community(`c${i}`, 0, null, 4), title }])),
    });
    const long = bandLayout(withTitles(["a very long community name", "another very long name"]), { width: 200 });
    const short = bandLayout(withTitles(["ab", "cd"]), { width: 200 });
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("never overlaps two circles in a band", () => {
    for (const band of model.bands) {
      const row = model.circles.filter((circle) => circle.level === band.level).sort((x, y) => x.x - y.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x - row[i - 1].x).toBeGreaterThanOrEqual(row[i].r + row[i - 1].r);
      }
    }
  });

  it("draws one curve per child and keeps it near its parent", () => {
    expect(model.links.map((link) => link.id).sort()).toEqual(["a>a1", "a>a2", "b>b1"]);
    const a = model.circles.find((circle) => circle.id === "a")!;
    const a1 = model.circles.find((circle) => circle.id === "a1")!;
    const b1 = model.circles.find((circle) => circle.id === "b1")!;
    // children of the left parent sit left of the children of the right parent
    expect(a1.x).toBeLessThan(b1.x);
    expect(Math.abs(a1.x - a.x)).toBeLessThan(300);
  });

  it("has nothing to draw for an empty set", () => {
    const empty = bandLayout({ ...partition, communities: new Map(), levels: [] });
    expect(empty.circles).toEqual([]);
    expect(empty.bands).toEqual([]);
    expect(empty.height).toBe(0);
  });

  it("reads an inverted numbering from the root down", () => {
    const inverted: Partition = {
      ...partition,
      rootLevel: 4,
      levels: [3, 4],
      communities: new Map([
        ["r", community("r", 4, null, 40)],
        ["c", community("c", 3, "r", 20)],
      ]),
    };
    const model2 = bandLayout(inverted);
    expect(model2.bands.map((band) => band.level)).toEqual([4, 3]);
    expect(model2.bands.map((band) => band.depth)).toEqual([0, 1]);
  });
});
