import { describe, expect, it } from "vitest";
import { buildEmbeddingIndex, decodeVector, fingerprintMatches, sameEmbeddingModel } from "./embeddings";

const bytesOf = (values: number[]): Uint8Array => {
  const buffer = new ArrayBuffer(values.length * 4);
  const view = new DataView(buffer);
  values.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return new Uint8Array(buffer);
};

const meta = { model: "embed-1", dim: "2" };

describe("decodeVector", () => {
  it("reads little-endian floats", () => {
    expect(Array.from(decodeVector(bytesOf([1, -2]), 2))).toEqual([1, -2]);
  });

  it("rejects a length that does not match the dimension", () => {
    expect(() => decodeVector(bytesOf([1, 2]), 3)).toThrow(/expected/);
  });

  it("reads a vector that starts partway into a shared buffer", () => {
    const whole = bytesOf([9, 9, 1, 2]);
    const slice = whole.subarray(8);
    expect(Array.from(decodeVector(slice, 2))).toEqual([1, 2]);
  });
});

describe("buildEmbeddingIndex", () => {
  it("keys the vectors by entity id", () => {
    const { index } = buildEmbeddingIndex([{ id: "e1", vector: bytesOf([1, 0]) }], meta);
    expect(index.model).toBe("embed-1");
    expect(index.dim).toBe(2);
    expect(Array.from(index.vectors.get("e1")!)).toEqual([1, 0]);
  });

  it("refuses a file with no model", () => {
    expect(() => buildEmbeddingIndex([], { dim: "2" })).toThrow(/which model/);
  });

  it("refuses a file with no usable dimension", () => {
    expect(() => buildEmbeddingIndex([], { model: "m", dim: "0" })).toThrow(/dimension/);
  });

  it("names the cause when the column came back as text", () => {
    expect(() => buildEmbeddingIndex([{ id: "e1", vector: "not bytes" }], meta)).toThrow(/fixed-length binary/);
  });

  it("refuses a file with nothing readable", () => {
    expect(() => buildEmbeddingIndex([{ id: "e1", vector: 42 }], meta)).toThrow(/no readable vectors/);
  });

  it("accepts a list-of-float column as well as bytes", () => {
    const { index } = buildEmbeddingIndex([{ id: "e1", vector: [1, 0] }], meta);
    expect(Array.from(index.vectors.get("e1")!)).toEqual([1, 0]);
  });

  it("skips a list whose length does not match the dimension", () => {
    const load = buildEmbeddingIndex([{ id: "e1", vector: [1, 0] }, { id: "e2", vector: [1, 0, 0] }], meta);
    expect(load.index.vectors.size).toBe(1);
  });

  it("skips broken rows and says how many", () => {
    const load = buildEmbeddingIndex(
      [{ id: "e1", vector: bytesOf([1, 0]) }, { id: "e2", vector: bytesOf([1, 0, 0]) }],
      meta,
    );
    expect(load.index.vectors.size).toBe(1);
    expect(load.notes[0]).toMatch(/1 embedding rows/);
  });

  it("reads the source fingerprints", () => {
    const load = buildEmbeddingIndex([{ id: "e1", vector: bytesOf([1, 0]) }], {
      ...meta,
      source_files: JSON.stringify({ "entities.parquet": "sha256:aa" }),
    });
    expect(load.index.sourceFiles).toEqual({ "entities.parquet": "sha256:aa" });
  });

  it("survives a damaged fingerprint block", () => {
    const load = buildEmbeddingIndex([{ id: "e1", vector: bytesOf([1, 0]) }], { ...meta, source_files: "{oops" });
    expect(load.index.sourceFiles).toEqual({});
  });
});

describe("fingerprintMatches", () => {
  const index = { model: "m", dim: 2, vectors: new Map(), sourceFiles: { "entities.parquet": "sha256:aa" } };

  it("accepts the same index", () => {
    expect(fingerprintMatches(index, { "entities.parquet": "sha256:aa" })).toBe(true);
  });

  it("rejects a different index", () => {
    expect(fingerprintMatches(index, { "entities.parquet": "sha256:bb" })).toBe(false);
  });

  it("accepts when the runner recorded nothing", () => {
    expect(fingerprintMatches({ ...index, sourceFiles: {} }, { "entities.parquet": "sha256:bb" })).toBe(true);
  });
});

describe("sameEmbeddingModel", () => {
  it("accepts the two halves of one model", () => {
    expect(sameEmbeddingModel("solar-embedding-1-large-passage", "solar-embedding-1-large-query")).toBe(true);
  });

  it("accepts the same name whatever the case and spacing", () => {
    expect(sameEmbeddingModel(" Text-Embedding-3-Small ", "text-embedding-3-small")).toBe(true);
  });

  it("refuses two different models, however alike the dimensions", () => {
    expect(sameEmbeddingModel("text-embedding-3-small", "solar-embedding-1-large-query")).toBe(false);
    expect(sameEmbeddingModel("text-embedding-3-small", "text-embedding-3-large")).toBe(false);
  });

  it("does not treat a suffix in the middle of a name as a role", () => {
    expect(sameEmbeddingModel("passage-model-a", "passage-model-b")).toBe(false);
  });
});
