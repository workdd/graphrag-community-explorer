import { beforeEach, describe, expect, it } from "vitest";
import { emptyAsk, forgetAll, indexKey, recall, remember } from "./askStore";

beforeEach(() => forgetAll());

describe("emptyAsk", () => {
  it("starts on the method the index can actually run", () => {
    expect(emptyAsk(true).method).toBe("local");
    expect(emptyAsk(false).method).toBe("global");
  });

  it("starts with nothing asked and nothing shown", () => {
    const state = emptyAsk(true);
    expect(state.question).toBe("");
    expect(state.run).toBeNull();
    expect(state.imported).toBeNull();
    expect(state.selection).toBeNull();
    expect(state.retrieval).toBeNull();
    expect(state.notes).toEqual([]);
  });
});

describe("indexKey", () => {
  const files = { "entities.parquet": "sha256:aa", "relationships.parquet": "sha256:bb" };

  it("does not depend on the order the digests arrive in", () => {
    const reversed = { "relationships.parquet": "sha256:bb", "entities.parquet": "sha256:aa" };
    expect(indexKey("demo", reversed)).toBe(indexKey("demo", files));
  });

  it("separates two folders that share a name", () => {
    expect(indexKey("output", files)).not.toBe(indexKey("output", { "entities.parquet": "sha256:cc" }));
  });

  it("separates the same folder re-indexed", () => {
    const after = { ...files, "entities.parquet": "sha256:zz" };
    expect(indexKey("demo", after)).not.toBe(indexKey("demo", files));
  });

  it("still tells two unfingerprinted labels apart", () => {
    expect(indexKey("a", {})).not.toBe(indexKey("b", {}));
  });
});

describe("remember and recall", () => {
  it("gives back what the tab was showing", () => {
    const state = { ...emptyAsk(true), question: "what breaks if the queue goes?" };
    remember("k", state);
    expect(recall("k")?.question).toBe("what breaks if the queue goes?");
  });

  it("knows nothing about an index it has not seen", () => {
    expect(recall("never")).toBeUndefined();
  });

  it("replaces rather than accumulates for one index", () => {
    remember("k", { ...emptyAsk(true), question: "first" });
    remember("k", { ...emptyAsk(true), question: "second" });
    expect(recall("k")?.question).toBe("second");
  });

  it("drops the index left alone longest once too many are open", () => {
    for (const name of ["a", "b", "c", "d", "e"]) remember(name, { ...emptyAsk(true), question: name });
    expect(recall("a")).toBeUndefined();
    expect(recall("e")?.question).toBe("e");
  });

  it("counts being written to as being used, so an active index is not the one dropped", () => {
    for (const name of ["a", "b", "c", "d"]) remember(name, { ...emptyAsk(true), question: name });
    remember("a", { ...emptyAsk(true), question: "a again" });
    remember("e", { ...emptyAsk(true), question: "e" });
    expect(recall("a")?.question).toBe("a again");
    expect(recall("b")).toBeUndefined();
  });
});
