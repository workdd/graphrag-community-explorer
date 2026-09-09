import { describe, expect, it } from "vitest";
import { apart, separate, type Box } from "./separate";

const box = (id: string, x: number, y: number, size: number): Box => ({ id, x, y, width: size, height: size });

/** The picture the user reported: one large type bubble with small ones sitting inside it. */
const swallowed: Box[] = [
  box("Container", 0, 0, 165),
  box("ElasticIP", 20, 10, 44),
  box("LaunchTemplate", -30, 25, 40),
  box("MachineImage", 10, -40, 36),
  box("Project", 400, 0, 120),
];

const moved = (before: Box[], after: Map<string, { x: number; y: number }>): Box[] =>
  before.map((item) => ({ ...item, ...after.get(item.id)! }));

describe("separate", () => {
  it("pulls small bubbles out of a large one", () => {
    expect(apart(swallowed)).toBe(false);
    const result = separate(swallowed, { gap: 6 });
    expect(result.left).toBe(0);
    expect(apart(moved(swallowed, result.positions), 6)).toBe(true);
  });

  it("leaves a set that already has room alone", () => {
    const roomy = [box("a", 0, 0, 20), box("b", 100, 0, 20), box("c", 0, 100, 20)];
    const result = separate(roomy);
    expect(result.rounds).toBe(0);
    for (const item of roomy) expect(result.positions.get(item.id)).toEqual({ x: item.x, y: item.y });
  });

  it("moves the small box further than the big one", () => {
    const pair = [box("big", 0, 0, 200), box("small", 10, 0, 20)];
    const result = separate(pair, { gap: 6 });
    const big = result.positions.get("big")!;
    const small = result.positions.get("small")!;
    expect(Math.abs(small.x - 10)).toBeGreaterThan(Math.abs(big.x));
    expect(apart(moved(pair, result.positions), 6)).toBe(true);
  });

  it("parts two boxes that sit exactly on top of each other", () => {
    const stacked = [box("a", 0, 0, 30), box("b", 0, 0, 30)];
    const result = separate(stacked, { gap: 4 });
    expect(apart(moved(stacked, result.positions), 4)).toBe(true);
  });

  it("gives the same answer whatever order it is handed", () => {
    const forwards = separate(swallowed, { gap: 6 }).positions;
    const backwards = separate([...swallowed].reverse(), { gap: 6 }).positions;
    for (const item of swallowed) {
      expect(backwards.get(item.id)!.x).toBeCloseTo(forwards.get(item.id)!.x, 9);
      expect(backwards.get(item.id)!.y).toBeCloseTo(forwards.get(item.id)!.y, 9);
    }
  });

  it("clears a crowd where everything starts in one place", () => {
    const crowd: Box[] = Array.from({ length: 60 }, (_, i) => box(`n${i}`, (i % 7) * 4, Math.floor(i / 7) * 4, 20 + (i % 5) * 12));
    const result = separate(crowd, { gap: 5 });
    expect(result.left).toBe(0);
    expect(apart(moved(crowd, result.positions), 5)).toBe(true);
  });

  it("comes out apart whatever it is given", () => {
    // A small seeded generator, so a failure can be reproduced from the seed alone.
    let seed = 20260909;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 40; run++) {
      const count = 2 + Math.floor(next() * 40);
      const spread = 20 + next() * 600;
      const items: Box[] = Array.from({ length: count }, (_, i) => ({
        id: `r${run}-${i}`,
        x: (next() - 0.5) * spread,
        y: (next() - 0.5) * spread,
        width: 10 + next() * 180,
        height: 10 + next() * 120,
      }));
      const result = separate(items, { gap: 6 });
      expect({ run, left: result.left }).toEqual({ run, left: 0 });
      expect({ run, apart: apart(moved(items, result.positions), 6) }).toEqual({ run, apart: true });
    }
  });

  it("keeps the shape: what was left stays left", () => {
    const row = [box("a", 0, 0, 60), box("b", 30, 0, 60), box("c", 60, 0, 60)];
    const result = separate(row, { gap: 4 });
    const [a, b, c] = ["a", "b", "c"].map((id) => result.positions.get(id)!);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });
});
