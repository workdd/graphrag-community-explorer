import { expect, it, vi } from "vitest";
import { runLocal, type RetrievalObservation } from "./run";
import { DEFAULT_LOCAL } from "./local";
import type { Dataset } from "../model";
it("observes actual ranking before chat, with budget exclusions and no extra embedding call", async () => {
  const dataset: Dataset = { source: { kind: "unknown", files: [] }, entities: new Map(["a", "b"].map(id => [id, { id, title: id, type: "VM", degree: 0, textUnitIds: [] }])), relationships: [], partitions: [], textUnits: new Map(), documents: new Map(), covariates: [] };
  const queryVector = Float32Array.from([1, 0]);
  const embed = vi.fn(async () => [queryVector]);
  let observed: RetrievalObservation | null = null;
  const chat = vi.fn(async () => { expect(observed).not.toBeNull(); return { text: "answer", usage: { promptTokens: 1, completionTokens: 1 } }; });
  const onRetrieval = vi.fn((value: RetrievalObservation) => { observed = value; });
  const result = await runLocal({ dataset, partition: null, embeddings: { model: "test", dim: 2, sourceFiles: {}, vectors: new Map([["a", queryVector], ["b", Float32Array.from([0, 1])]]) }, provider: { baseUrl: "https://example.test", apiKey: "test", chatModel: "test", embedModel: "test" }, query: "original question", responseLanguage: "English", options: { ...DEFAULT_LOCAL, tokenBudget: 0 }, onRetrieval }, { embed, chat });
  expect(result.status).toBe("ok");
  expect(embed).toHaveBeenCalledTimes(1);
  expect(onRetrieval).toHaveBeenCalledWith({ query: "original question", queryVector, seeds: [{ id: "a", title: "a", score: 1 }, { id: "b", title: "b", score: 0 }], contextEntityIds: [] });
  expect(JSON.stringify(result)).not.toContain("queryVector");
});
