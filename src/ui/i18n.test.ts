import { describe, expect, it } from "vitest";
import { fill } from "./i18n";

describe("fill", () => {
  it("replaces placeholders and leaves unknown ones", () => {
    expect(fill("{a} and {b} {c}", { a: 1, b: "two" })).toBe("1 and two {c}");
    expect(fill("plain")).toBe("plain");
  });
});
