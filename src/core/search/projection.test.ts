import { describe, expect, it } from "vitest";
import { boxScale, centreRows, fitToBox, normalizeRows, project, projectInto, topComponents, totalSpread, type Matrix } from "./projection";

const matrix = (dim: number, rows: number[][]): Matrix => ({
  ids: rows.map((_, i) => `e${i}`),
  values: Float32Array.from(rows.flat()),
  dim,
});

describe("normalizeRows", () => {
  it("gives every row unit length", () => {
    const m = matrix(2, [[3, 4], [0, 5]]);
    normalizeRows(m);
    // float32 storage, so compare within its precision rather than exactly.
    [0.6, 0.8, 0, 1].forEach((want, i) => expect(m.values[i]).toBeCloseTo(want, 6));
  });

  it("leaves a zero row alone rather than dividing by nothing", () => {
    const m = matrix(2, [[0, 0]]);
    normalizeRows(m);
    expect(Array.from(m.values)).toEqual([0, 0]);
  });
});

describe("centreRows", () => {
  it("moves the centre to the origin and reports where it was", () => {
    const m = matrix(2, [[1, 2], [3, 4]]);
    expect(Array.from(centreRows(m))).toEqual([2, 3]);
    expect(Array.from(m.values)).toEqual([-1, -1, 1, 1]);
  });

  it("has nothing to centre when there are no rows", () => {
    expect(Array.from(centreRows(matrix(2, [])))).toEqual([0, 0]);
  });
});

describe("topComponents", () => {
  it("finds the direction the data actually runs along", () => {
    const m = matrix(2, [[-2, 0], [-1, 0], [1, 0], [2, 0]]);
    centreRows(m);
    const [first] = topComponents(m, 1, 20);
    expect(Math.abs(first[0])).toBeCloseTo(1, 5);
    expect(Math.abs(first[1])).toBeCloseTo(0, 5);
  });

  it("makes the second axis square to the first", () => {
    const m = matrix(2, [[-2, -1], [-1, 1], [1, -1], [2, 1]]);
    centreRows(m);
    const [a, b] = topComponents(m, 2, 30);
    expect(a[0] * b[0] + a[1] * b[1]).toBeCloseTo(0, 5);
  });

  it("returns nothing for an empty matrix", () => {
    expect(topComponents(matrix(3, []), 2)).toEqual([]);
  });
});

describe("project", () => {
  it("puts most of the spread on the first axis when the data is a line", () => {
    const p = project(matrix(3, [[-2, 0, 0], [-1, 0, 0], [1, 0, 0], [2, 0, 0]]), 2, 20);
    expect(p.variance[0]).toBeGreaterThan(0.99);
    expect(p.variance[1]).toBeLessThan(0.01);
  });

  it("spreads it over the axes when the data fills them", () => {
    const p = project(matrix(3, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]), 3, 30);
    const sum = p.variance.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 3);
    for (const share of p.variance) expect(share).toBeCloseTo(1 / 3, 2);
  });

  it("gives one coordinate set per row, in the same order", () => {
    const p = project(matrix(2, [[1, 0], [0, 1], [-1, 0]]), 2, 10);
    expect(p.ids).toEqual(["e0", "e1", "e2"]);
    expect(p.coords).toHaveLength(6);
  });

  it("reports no variance for an empty index", () => {
    const p = project(matrix(4, []), 3);
    expect(p.variance).toEqual([0, 0, 0]);
    expect(p.coords).toHaveLength(0);
  });

  it("ignores how long the vectors are, the way cosine does", () => {
    const short = project(matrix(2, [[1, 0], [0, 1], [-1, 0]]), 2, 20);
    const long = project(matrix(2, [[9, 0], [0, 9], [-9, 0]]), 2, 20);
    expect(long.variance[0]).toBeCloseTo(short.variance[0], 6);
  });
});

describe("totalSpread and fitToBox", () => {
  it("measures the spread that is left after centring", () => {
    const m = matrix(2, [[1, 0], [-1, 0]]);
    expect(totalSpread(m)).toBeCloseTo(2);
  });

  it("scales the widest coordinate onto the edge of the box", () => {
    const p = project(matrix(2, [[-2, 0], [2, 0], [0, 1], [0, -1]]), 2, 20);
    const fitted = fitToBox(p, 1);
    expect(Math.max(...Array.from(fitted).map(Math.abs))).toBeCloseTo(1, 5);
  });

  it("survives an index whose points all sit on top of each other", () => {
    const p = project(matrix(2, [[1, 1], [1, 1]]), 2, 5);
    expect(Array.from(fitToBox(p, 1))).toEqual([0, 0, 0, 0]);
  });
});

describe("axes the data does not have", () => {
  it("reports no variance and no coordinates for an axis with nothing left", () => {
    // Every point lands on one of two opposite unit vectors, so only one direction carries spread.
    const p = project(matrix(3, [[-2, 0, 0], [-1, 0, 0], [1, 0, 0], [2, 0, 0]]), 3, 20);
    expect(p.variance[0]).toBeCloseTo(1, 5);
    expect(p.variance[1]).toBeCloseTo(0, 8);
    expect(p.variance[2]).toBeCloseTo(0, 8);
    for (let row = 0; row < 4; row += 1) {
      expect(p.coords[row * 3 + 1]).toBe(0);
      expect(p.coords[row * 3 + 2]).toBe(0);
    }
  });

  it("asks for more axes than the data has and still adds up to one", () => {
    const p = project(matrix(2, [[1, 0], [-1, 0], [0, 1], [0, -1]]), 3, 20);
    expect(p.variance.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
    expect(p.variance[2]).toBeCloseTo(0, 8);
  });
});

describe("projectInto", () => {
  it("puts a vector already in the data where the projection put it", () => {
    const rows = [[2, 0, 0], [-2, 0, 0], [0, 1, 0], [0, -1, 0]];
    const p = project(matrix(3, rows), 2, 30);
    const again = projectInto(Float32Array.from(rows[0]), p.basis);
    expect(again[0]).toBeCloseTo(p.coords[0], 4);
    expect(again[1]).toBeCloseTo(p.coords[1], 4);
  });

  it("places a vector that was never in the data", () => {
    const p = project(matrix(3, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]), 2, 30);
    const out = projectInto(Float32Array.from([0.7, 0.7, 0]), p.basis);
    expect(out).toHaveLength(2);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("ignores the length of the new vector, as it did for the rest", () => {
    const p = project(matrix(3, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]), 2, 30);
    const small = projectInto(Float32Array.from([0.3, 0, 0]), p.basis);
    const large = projectInto(Float32Array.from([30, 0, 0]), p.basis);
    expect(small[0]).toBeCloseTo(large[0], 6);
  });

  it("refuses a vector of another width rather than drawing it somewhere wrong", () => {
    const p = project(matrix(3, [[1, 0, 0], [-1, 0, 0]]), 2, 5);
    expect(() => projectInto(Float32Array.from([1, 0]), p.basis)).toThrow(/dimensions/);
  });
});

describe("boxScale", () => {
  it("is the factor fitToBox applied", () => {
    const p = project(matrix(2, [[-2, 0], [2, 0], [0, 1], [0, -1]]), 2, 20);
    const scale = boxScale(p, 1);
    const fitted = fitToBox(p, 1);
    expect(fitted[0]).toBeCloseTo(p.coords[0] * scale, 6);
  });

  it("is zero when every point sits on the centre", () => {
    expect(boxScale(project(matrix(2, [[1, 1], [1, 1]]), 2, 5), 1)).toBe(0);
  });
});
