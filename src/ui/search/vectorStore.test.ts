import { describe, expect, it } from "vitest";
import { vectorKey } from "./vectorStore";

describe("what the cached vectors are filed under", () => {
  it("separates two models over the same index", () => {
    expect(vectorKey("demo files", "solar")).not.toBe(vectorKey("demo files", "openai"));
  });

  it("separates the same model over two indexes", () => {
    expect(vectorKey("a", "m")).not.toBe(vectorKey("b", "m"));
  });

  it("cannot be confused by halves that run together", () => {
    // Without a separator, "a" + "b" and "ab" + "" would be the same key.
    expect(vectorKey("b", "a")).not.toBe(vectorKey("", "ab"));
  });

  it("finds vectors built by the other half of a split model", () => {
    // Upstage builds with a passage model and asks with a query model. One model, one key.
    expect(vectorKey("demo", "solar-embedding-1-large-passage")).toBe(
      vectorKey("demo", "solar-embedding-1-large-query"),
    );
  });

  it("still separates genuinely different models", () => {
    expect(vectorKey("demo", "text-embedding-3-small")).not.toBe(vectorKey("demo", "text-embedding-3-large"));
  });
});
