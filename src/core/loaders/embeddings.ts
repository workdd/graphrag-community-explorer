// Entity embeddings that GraphRAG writes to a vector store rather than to Parquet. The runner in
// tools/embed_index puts them in one file so the tab can rank entities without a server.
import { parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import type { Row } from "./parquet";

export interface EmbeddingIndex {
  /** Model that produced the stored vectors. A query embedded with anything else is meaningless. */
  model: string;
  dim: number;
  vectors: Map<string, Float32Array>;
  /** File name to sha256 of the index the vectors were made from. Empty when the runner wrote none. */
  sourceFiles: Record<string, string>;
}

export interface EmbeddingLoad {
  index: EmbeddingIndex;
  notes: string[];
}

const FLOAT_BYTES = 4;

/** Parquet stores the vector as little-endian float32, so the platform's own order is not assumed. */
export function decodeVector(bytes: Uint8Array, dim: number): Float32Array {
  if (bytes.byteLength !== dim * FLOAT_BYTES) {
    throw new Error(`Vector is ${bytes.byteLength} bytes, expected ${dim * FLOAT_BYTES} for ${dim} dimensions.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i += 1) out[i] = view.getFloat32(i * FLOAT_BYTES, true);
  return out;
}

const asBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
};

export function buildEmbeddingIndex(rows: Row[], meta: Record<string, string>): EmbeddingLoad {
  const model = meta.model?.trim();
  const dim = Number(meta.dim);
  if (!model) throw new Error("The embeddings file does not say which model produced it.");
  if (!Number.isInteger(dim) || dim <= 0) throw new Error("The embeddings file does not carry a valid dimension.");

  let sourceFiles: Record<string, string> = {};
  if (meta.source_files) {
    try {
      const parsed: unknown = JSON.parse(meta.source_files);
      if (parsed && typeof parsed === "object") sourceFiles = parsed as Record<string, string>;
    } catch {
      // A damaged fingerprint block only costs the staleness check, so the file is still usable.
    }
  }

  const vectors = new Map<string, Float32Array>();
  const notes: string[] = [];
  let malformed = 0;
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : row.id == null ? "" : String(row.id);
    const bytes = asBytes(row.vector);
    if (id === "" || bytes === null) {
      malformed += 1;
      continue;
    }
    try {
      vectors.set(id, decodeVector(bytes, dim));
    } catch {
      malformed += 1;
    }
  }
  if (malformed > 0) notes.push(`${malformed} embedding rows were unreadable and were skipped.`);
  if (vectors.size === 0) throw new Error("The embeddings file has no readable vectors.");
  return { index: { model, dim, vectors, sourceFiles }, notes };
}

export async function readEmbeddings(buffer: ArrayBuffer): Promise<EmbeddingLoad> {
  const file = { byteLength: buffer.byteLength, slice: (s: number, e?: number) => buffer.slice(s, e) };
  const metadata = await parquetMetadataAsync(file);
  const meta: Record<string, string> = {};
  for (const entry of metadata.key_value_metadata ?? []) {
    if (entry?.key) meta[entry.key] = String(entry.value ?? "");
  }
  const rows = (await parquetReadObjects({ file })) as Row[];
  return buildEmbeddingIndex(rows, meta);
}

/** Same index or not. An embeddings file made before the last indexing run ranks the wrong things. */
export function fingerprintMatches(index: EmbeddingIndex, loaded: Record<string, string>): boolean {
  const keys = Object.keys(index.sourceFiles);
  if (keys.length === 0) return true;
  return keys.every((name) => loaded[name] === undefined || loaded[name] === index.sourceFiles[name]);
}
