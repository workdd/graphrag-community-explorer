import { describe, expect, it } from "vitest";
import { clampPitch, clampZoom, frame, hit, MAX_ZOOM, MIN_ZOOM, pan, place, START, turn, zoomAt } from "./spaceView";

const coords = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const flat = { ...START, yaw: 0, pitch: 0 };

describe("place", () => {
  it("puts the origin at the centre", () => {
    const [first] = place(coords, 4, flat, 400, 200, true);
    expect(first).toMatchObject({ x: 200, y: 100 });
  });

  it("keeps the picture round: the scale follows the shorter side", () => {
    const p = place(coords, 4, flat, 400, 200, true);
    // x = 1 moves by 0.42 of the shorter side, not of the width.
    expect(p[1].x - p[0].x).toBeCloseTo(200 * 0.42, 5);
  });

  it("ignores the third value in two dimensions", () => {
    const p2 = place(coords, 4, flat, 400, 200, false);
    expect(p2[3]).toMatchObject({ x: 200, y: 100, depth: 0 });
  });

  it("moves points when the camera turns", () => {
    const still = place(coords, 4, flat, 400, 200, true);
    const turned = place(coords, 4, turn(flat, 100, 0), 400, 200, true);
    expect(turned[1].x).not.toBeCloseTo(still[1].x, 3);
  });

  it("follows the pan", () => {
    const [first] = place(coords, 4, pan(flat, 30, -10), 400, 200, true);
    expect(first).toMatchObject({ x: 230, y: 90 });
  });
});

describe("turn", () => {
  it("never lets the cloud flip over", () => {
    expect(clampPitch(99)).toBeLessThanOrEqual(1.4);
    expect(turn(flat, 0, 100000).pitch).toBeLessThanOrEqual(1.4);
    expect(turn(flat, 0, -100000).pitch).toBeGreaterThanOrEqual(-1.4);
  });
});

describe("zoomAt", () => {
  it("holds the point under the cursor still", () => {
    const before = place(coords, 4, flat, 400, 200, true);
    const target = before[1];
    const camera = zoomAt(flat, 2, target.x, target.y, 200, 100);
    const after = place(coords, 4, camera, 400, 200, true);
    expect(after[1].x).toBeCloseTo(target.x, 3);
    expect(after[1].y).toBeCloseTo(target.y, 3);
  });

  it("stays inside the limits", () => {
    expect(zoomAt(flat, 1000, 0, 0, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(flat, 0.0001, 0, 0, 0, 0).zoom).toBe(MIN_ZOOM);
    expect(clampZoom(5)).toBe(5);
  });
});

describe("hit", () => {
  const placed = place(coords, 4, flat, 400, 200, true);

  it("finds the point under the pointer", () => {
    expect(hit(placed, 200, 100)).toBe(0);
  });

  it("finds nothing in empty space", () => {
    expect(hit(placed, 5, 5)).toBeNull();
  });

  it("takes the nearer of two that overlap", () => {
    const pair = [{ index: 7, x: 10, y: 10, depth: 0 }, { index: 8, x: 12, y: 10, depth: 0 }];
    expect(hit(pair, 12, 10)).toBe(8);
  });
});

describe("frame", () => {
  const placed = place(coords, 4, flat, 400, 200, true);

  it("brings the chosen points to the middle", () => {
    const camera = frame(placed, [1], flat, 400, 200);
    const after = place(coords, 4, camera, 400, 200, true);
    expect(after[1].x).toBeCloseTo(200, 0);
    expect(after[1].y).toBeCloseTo(100, 0);
  });

  it("leaves the camera alone when nothing was chosen", () => {
    expect(frame(placed, [], flat, 400, 200)).toEqual(flat);
  });

  it("does not turn the cloud while framing", () => {
    const camera = frame(placed, [1, 2], flat, 400, 200);
    expect(camera.yaw).toBe(flat.yaw);
    expect(camera.pitch).toBe(flat.pitch);
  });
});
