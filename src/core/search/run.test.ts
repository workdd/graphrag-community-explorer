import { describe, expect, it, vi } from "vitest";
import type { Community, Dataset, Partition } from "../model";
import type { EmbeddingIndex } from "../loaders/embeddings";
import { DEFAULT_GLOBAL } from "./global";
import { DEFAULT_LOCAL } from "./local";
import type { Provider } from "./llm";
import { newTrace, plannedCalls, runGlobal, runLocal, type Client } from "./run";

const provider: Provider = { baseUrl: "https://x.test/v1", apiKey: "sk-secret-value", chatModel: "c", embedModel: "e" };

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([["a", { id: "a", title: "Alpha", type: "Service", description: "d", degree: 0, textUnitIds: [] }]]),
  relationships: [],
  partitions: [],
  textUnits: new Map(),
  documents: new Map(),
  covariates: [],
};

const embeddings: EmbeddingIndex = {
  model: "e", dim: 2, sourceFiles: {}, vectors: new Map([["a", Float32Array.from([1, 0])]]),
};

const community = (id: string, rank: number): Community => ({
  id, level: 0, parentId: null, childIds: [], title: `C${id}`, entityIds: [], relationshipIds: [],
  size: 1, membershipSource: "entity_ids", textUnitIds: [], report: { summary: "s", findings: [], rank },
});
const partition: Partition = {
  id: "p", label: "p", levels: [0], rootLevel: 0,
  communities: new Map([["a", community("a", 1)], ["b", community("b", 2)]]),
};

const client = (over: Partial<Client> = {}): Client => ({
  embed: vi.fn(async () => [Float32Array.from([1, 0])]),
  chat: vi.fn(async () => ({ text: "answer [Data: Entities (1)]", usage: { promptTokens: 10, completionTokens: 2 } })),
  ...over,
});

const localInput = {
  dataset, partition, embeddings, provider, query: "q", options: DEFAULT_LOCAL, responseLanguage: "English",
};

describe("runLocal", () => {
  it("returns the answer, the context and the recorded usage", async () => {
    const run = await runLocal(localInput, client());
    expect(run.status).toBe("ok");
    expect(run.response).toContain("answer");
    expect(run.context.entities).toHaveLength(1);
    expect(run.stats).toMatchObject({ llmCalls: 2, promptTokens: 10, completionTokens: 2 });
    expect(run.stages.map((s) => s.name)).toEqual(["embed", "select", "chat"]);
  });

  it("keeps the credentials out of the settings", async () => {
    const run = await runLocal(localInput, client());
    expect(JSON.stringify(run.settings)).not.toContain("sk-secret-value");
    expect(JSON.stringify(run.settings)).not.toContain("x.test");
    expect(run.settings).toMatchObject({ chatModel: "c", embedModel: "e", topK: 10 });
  });

  it("leaves the token counts null when the provider reports none", async () => {
    const run = await runLocal(localInput, client({
      chat: vi.fn(async () => ({ text: "a", usage: { promptTokens: null, completionTokens: null } })),
    }));
    expect(run.stats.promptTokens).toBeNull();
  });

  it("does not call the model when nothing was selected", async () => {
    const chat = vi.fn(async () => ({ text: "x", usage: { promptTokens: null, completionTokens: null } }));
    const run = await runLocal({ ...localInput, options: { ...DEFAULT_LOCAL, topK: 0 } }, client({ chat }));
    expect(chat).not.toHaveBeenCalled();
    expect(run.response).toBe("");
    expect(run.status).toBe("ok");
  });

  it("records a provider failure instead of throwing", async () => {
    const run = await runLocal(localInput, client({
      embed: vi.fn(async () => { throw new Error("401 no key"); }),
    }));
    expect(run.status).toBe("error");
    expect(run.error).toMatch(/401/);
    expect(run.context.entities).toEqual([]);
  });

  it("refuses an embeddings file with no vectors", async () => {
    const run = await runLocal({ ...localInput, embeddings: { ...embeddings, vectors: new Map() } }, client());
    expect(run.status).toBe("error");
    expect(run.error).toMatch(/no vectors/);
  });
});

describe("plannedCalls", () => {
  it("counts the batches plus the final call", () => {
    expect(plannedCalls(partition, DEFAULT_GLOBAL)).toEqual({ reports: 2, batches: 1, calls: 2 });
  });

  it("counts nothing when there are no reports", () => {
    expect(plannedCalls(null, DEFAULT_GLOBAL)).toEqual({ reports: 0, batches: 0, calls: 0 });
  });
});

describe("runGlobal", () => {
  const globalInput = { partition, provider, query: "q", options: DEFAULT_GLOBAL, responseLanguage: "English" };

  it("maps the batches then reduces once", async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce({ text: '{"points":[{"description":"p","score":9,"reports":["1"]}]}', usage: { promptTokens: 5, completionTokens: 1 } })
      .mockResolvedValueOnce({ text: "final [Data: Reports (1)]", usage: { promptTokens: 4, completionTokens: 1 } });
    const run = await runGlobal(globalInput, client({ chat }));
    expect(chat).toHaveBeenCalledTimes(2);
    expect(run.response).toContain("final");
    expect(run.stages.map((s) => s.name)).toEqual(["collect", "map", "reduce"]);
    expect(run.stats.promptTokens).toBe(9);
  });

  it("lists every report it sent so citations resolve", async () => {
    const run = await runGlobal(globalInput, client({
      chat: vi.fn(async () => ({ text: '{"points":[]}', usage: { promptTokens: null, completionTokens: null } })),
    }));
    expect(run.context.reports.map((r) => r.shortId)).toEqual(["1", "2"]);
  });

  it("stops before the final call when no point survived", async () => {
    const chat = vi.fn(async () => ({ text: '{"points":[]}', usage: { promptTokens: null, completionTokens: null } }));
    const run = await runGlobal(globalInput, client({ chat }));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(run.response).toBe("");
  });

  it("answers nothing when the partition has no reports", async () => {
    const chat = vi.fn();
    const run = await runGlobal({ ...globalInput, partition: null }, client({ chat }));
    expect(chat).not.toHaveBeenCalled();
    expect(run.status).toBe("ok");
  });

  it("records a failure in the middle of the batches", async () => {
    const run = await runGlobal(globalInput, client({
      chat: vi.fn(async () => { throw new Error("429 slow down"); }),
    }));
    expect(run.status).toBe("error");
    expect(run.error).toMatch(/429/);
  });
});

describe("newTrace", () => {
  it("stamps the schema, the producer and the index", () => {
    const trace = newTrace("q", "age", { "entities.parquet": "sha256:aa" }, [], "9.9.9");
    expect(trace.schemaVersion).toBe("1.0");
    expect(trace.producer).toEqual({ tool: "explorer", version: "9.9.9" });
    expect(trace.index).toEqual({ label: "age", files: { "entities.parquet": "sha256:aa" } });
    expect(Date.parse(trace.createdAt)).not.toBeNaN();
  });
});
