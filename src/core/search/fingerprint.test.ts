import { describe, expect, it } from "vitest";
import { matches, mismatches, sha256 } from "./fingerprint";

describe("sha256", () => {
  it("hashes the bytes and labels the algorithm", async () => {
    const digest = await sha256(new Uint8Array([1, 2, 3]).buffer);
    expect(digest.startsWith("sha256:")).toBe(true);
    expect(digest).toHaveLength(7 + 64);
  });

  it("gives the same answer for the same bytes", async () => {
    const a = await sha256(new Uint8Array([9]).buffer);
    const b = await sha256(new Uint8Array([9]).buffer);
    expect(a).toBe(b);
  });

  it("gives a different answer for different bytes", async () => {
    expect(await sha256(new Uint8Array([1]).buffer)).not.toBe(await sha256(new Uint8Array([2]).buffer));
  });
});

describe("mismatches", () => {
  it("finds nothing when both sides agree", () => {
    expect(mismatches({ a: "1" }, { a: "1" })).toEqual([]);
  });

  it("names the files that disagree", () => {
    expect(mismatches({ b: "1", a: "1" }, { a: "2", b: "9" })).toEqual(["a", "b"]);
  });

  it("ignores files the other side does not have", () => {
    expect(matches({ a: "1", c: "3" }, { a: "1" })).toBe(true);
  });

  it("treats an empty expectation as agreement", () => {
    expect(matches({}, { a: "1" })).toBe(true);
  });
});
