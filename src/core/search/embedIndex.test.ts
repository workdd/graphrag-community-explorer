import { describe, expect, it, vi } from "vitest";
import type { Dataset, Entity } from "../model";
import type { Provider } from "./llm";
import { BATCH, embedEntities, entityCard, planEmbedding, type EmbedCall } from "./embedIndex";

const entity = (id: string, description?: string): Entity => ({
  id,
  title: `Title ${id}`,
  type: "T",
  ...(description === undefined ? {} : { description }),
  degree: 1,
  textUnitIds: [],
});

const datasetOf = (n: number): Dataset => ({
  source: { kind: "graphrag", files: [] },
  entities: new Map(Array.from({ length: n }, (_, i) => [`e${i}`, entity(`e${i}`, `about ${i}`)])),
  relationships: [],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
});

const provider: Provider = { baseUrl: "https://x/v1", apiKey: "k", chatModel: "c", embedModel: "m" };

/** A provider that answers with vectors of a fixed width, and records what it was asked. */
const fake = (dim = 4): { call: EmbedCall; seen: string[][] } => {
  const seen: string[][] = [];
  const call: EmbedCall = async (_p, input) => {
    seen.push(input);
    return input.map((_, i) => Float32Array.from({ length: dim }, (_v, j) => i + j));
  };
  return { call, seen };
};

describe("the text a vector stands for", () => {
  it("is the title and the description, the way the offline tool writes it", () => {
    expect(entityCard({ title: "Search events 7", description: "carries messages" })).toBe(
      "Search events 7: carries messages",
    );
  });

  it("is the title alone when there is no description", () => {
    expect(entityCard({ title: "Alpha", description: "" })).toBe("Alpha");
    expect(entityCard({ title: "Alpha", description: undefined })).toBe("Alpha");
    expect(entityCard({ title: " Alpha ", description: "  " })).toBe("Alpha");
  });
});

describe("what a run will cost, before it is spent", () => {
  it("counts entities, requests and characters", () => {
    const plan = planEmbedding(datasetOf(100), provider, 64);
    expect(plan).toMatchObject({ entities: 100, batches: 2, model: "m" });
    expect(plan.characters).toBeGreaterThan(0);
  });

  it("charges one request for a part-full batch", () => {
    expect(planEmbedding(datasetOf(1), provider, 64).batches).toBe(1);
    expect(planEmbedding(datasetOf(65), provider, 64).batches).toBe(2);
    expect(planEmbedding(datasetOf(0), provider, 64).batches).toBe(0);
  });

  it("uses the same batch size as the offline runner by default", () => {
    expect(planEmbedding(datasetOf(64), provider).batches).toBe(1);
    expect(BATCH).toBe(64);
  });
});

describe("embedding the index", () => {
  const sourceFiles = { "entities.parquet": "sha256:aa" };

  it("returns one vector an entity, with the model and the width on it", async () => {
    const { call, seen } = fake(4);
    const { index, stopped } = await embedEntities({ dataset: datasetOf(3), provider, sourceFiles }, call);
    expect(stopped).toBe(false);
    expect(index.vectors.size).toBe(3);
    expect(index).toMatchObject({ model: "m", dim: 4, sourceFiles });
    expect(seen).toEqual([["Title e0: about 0", "Title e1: about 1", "Title e2: about 2"]]);
  });

  it("splits into batches and reports progress as it goes", async () => {
    const { call, seen } = fake();
    const progress: number[] = [];
    await embedEntities(
      { dataset: datasetOf(5), provider, sourceFiles, batch: 2, onProgress: (p) => progress.push(p.done) },
      call,
    );
    expect(seen.map((batch) => batch.length)).toEqual([2, 2, 1]);
    expect(progress).toEqual([2, 4, 5]);
  });

  it("keeps what it finished when it is stopped", async () => {
    const controller = new AbortController();
    let batches = 0;
    const call: EmbedCall = async (_p, input) => {
      batches += 1;
      if (batches === 2) controller.abort(); // stopped after this batch is already paid for
      return input.map(() => Float32Array.from([1, 2, 3, 4]));
    };
    const { index, stopped } = await embedEntities(
      { dataset: datasetOf(10), provider, sourceFiles, batch: 2, signal: controller.signal },
      call,
    );
    expect(stopped).toBe(true);
    expect(index.vectors.size).toBe(4);
    expect(index.dim).toBe(4);
  });

  it("refuses a provider that changes the width halfway", async () => {
    let first = true;
    const call: EmbedCall = async (_p, input) => {
      const dim = first ? 4 : 8;
      first = false;
      return input.map(() => new Float32Array(dim));
    };
    await expect(
      embedEntities({ dataset: datasetOf(4), provider, sourceFiles, batch: 2 }, call),
    ).rejects.toThrow(/expected 4/);
  });

  it("refuses a provider that answers with the wrong number of vectors", async () => {
    const call: EmbedCall = async () => [new Float32Array(4)];
    await expect(
      embedEntities({ dataset: datasetOf(4), provider, sourceFiles, batch: 4 }, call),
    ).rejects.toThrow(/1 vectors for 4 entities/);
  });

  it("asks nothing of a provider when there is nothing to embed", async () => {
    const call = vi.fn();
    const { index } = await embedEntities({ dataset: datasetOf(0), provider, sourceFiles }, call as unknown as EmbedCall);
    expect(call).not.toHaveBeenCalled();
    expect(index.vectors.size).toBe(0);
  });
});
