// Building the entity vectors that local search needs, here, rather than in a Python script.
//
// GraphRAG writes entity embeddings to a vector store a browser cannot read, so until now the only
// way to switch local search on was to install Python and run tools/embed_index. Everything else in
// this project is a folder and a browser tab; this closes the gap, and the sidecar file stays the
// portable form for anyone who wants to build the vectors once and hand them round.
//
// The provider call is an argument, so the tests never reach the network.
import type { EmbeddingIndex } from "../loaders/embeddings";
import type { Dataset, Entity } from "../model";
import type { Provider } from "./llm";

/** Entities a provider will accept in one request. The Python runner uses the same number. */
export const BATCH = 64;

/**
 * The text a vector stands for. This has to match what tools/embed_index writes, or a sidecar built
 * there and vectors built here would rank the same question differently.
 */
export function entityCard(entity: Pick<Entity, "title" | "description">): string {
  const title = (entity.title ?? "").trim();
  const description = (entity.description ?? "").trim();
  return description === "" ? title : `${title}: ${description}`;
}

export interface EmbedPlan {
  entities: number;
  /** Requests to the provider. */
  batches: number;
  /** Characters of text that will be sent, which is what a provider charges for. */
  characters: number;
  model: string;
}

export function planEmbedding(dataset: Dataset, provider: Provider, batch = BATCH): EmbedPlan {
  let characters = 0;
  for (const entity of dataset.entities.values()) characters += entityCard(entity).length;
  const entities = dataset.entities.size;
  return {
    entities,
    batches: Math.ceil(entities / Math.max(1, batch)),
    characters,
    model: provider.embedModel,
  };
}

export interface EmbedProgress {
  /** Entities embedded so far. */
  done: number;
  total: number;
  batchesDone: number;
  batches: number;
}

export interface EmbedInput {
  dataset: Dataset;
  provider: Provider;
  /** Digests of the files the vectors are being built from, so a later index can be told apart. */
  sourceFiles: Record<string, string>;
  batch?: number;
  signal?: AbortSignal;
  onProgress?: (progress: EmbedProgress) => void;
}

export interface EmbedResult {
  index: EmbeddingIndex;
  /** True when the caller stopped it. What was finished is still in the index. */
  stopped: boolean;
}

export type EmbedCall = (
  provider: Provider,
  input: string[],
  opts: { signal?: AbortSignal },
) => Promise<Float32Array[]>;

/** Ids in a fixed order, so a stopped run and a resumed one agree on what is already done. */
const order = (dataset: Dataset): Entity[] => [...dataset.entities.values()];

/**
 * Embeds every entity, a batch at a time. Stopping keeps what was finished: a run over ten thousand
 * entities is a hundred and sixty requests, and somebody will want to stop it without losing them.
 */
export async function embedEntities(input: EmbedInput, call: EmbedCall): Promise<EmbedResult> {
  const batch = Math.max(1, input.batch ?? BATCH);
  const entities = order(input.dataset);
  const batches = Math.ceil(entities.length / batch);
  const vectors = new Map<string, Float32Array>();
  let dim = 0;

  for (let i = 0; i < entities.length; i += batch) {
    if (input.signal?.aborted) {
      return { index: built(vectors, dim, input), stopped: true };
    }
    const slice = entities.slice(i, i + batch);
    const made = await call(input.provider, slice.map(entityCard), { signal: input.signal });
    if (made.length !== slice.length) {
      throw new Error(`The provider returned ${made.length} vectors for ${slice.length} entities.`);
    }
    for (let j = 0; j < slice.length; j += 1) {
      const vector = made[j];
      if (dim === 0) dim = vector.length;
      // A provider that changes width mid-run would leave a file nothing can rank against.
      if (vector.length !== dim) throw new Error(`Vector ${j + 1} has ${vector.length} values, expected ${dim}.`);
      vectors.set(slice[j].id, vector);
    }
    input.onProgress?.({
      done: Math.min(i + batch, entities.length),
      total: entities.length,
      batchesDone: Math.floor(i / batch) + 1,
      batches,
    });
  }
  return { index: built(vectors, dim, input), stopped: false };
}

const built = (vectors: Map<string, Float32Array>, dim: number, input: EmbedInput): EmbeddingIndex => ({
  model: input.provider.embedModel,
  dim,
  vectors,
  sourceFiles: input.sourceFiles,
});
