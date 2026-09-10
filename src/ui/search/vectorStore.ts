// Vectors built in the browser, kept so they are built once.
//
// Embedding an index costs money and minutes. Re-opening the same folder must not spend either
// again, and re-indexing must not quietly rank a question against the old vectors, so the key
// carries the digests of the files they were made from and the model that made them.
//
// Structured clone stores a Map of Float32Array as it stands, so nothing is serialised by hand.
import { embeddingFamily, type EmbeddingIndex } from "../../core/loaders/embeddings";

const DB = "graphrag-community-explorer";
const STORE = "vectors";
/** Bumped alongside STORE: the layout cache lives in version 1 of the same database. */
const VERSION = 2;

/**
 * Vectors built as one half of a split model have to be found by the other half. Upstage builds
 * with a passage model and asks with a query model, and they are one model; filing them under the
 * name as typed would offer to build them again the moment the caller switched halves.
 */
export const vectorKey = (indexKey: string, model: string): string => `${embeddingFamily(model)} ${indexKey}`;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        // The layout store is created by its own client at version 1; only add what is missing.
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains("layouts")) db.createObjectStore("layouts");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readVectors(key: string): Promise<EmbeddingIndex | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const stored = request.result as EmbeddingIndex | undefined;
        // A half-written entry is no entry: local search would rank against a fraction of the index.
        resolve(stored && stored.vectors instanceof Map && stored.vectors.size > 0 ? stored : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Best effort. A browser that refuses to store them still has them for this page. */
export async function writeVectors(key: string, index: EmbeddingIndex): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(index, key);
  } catch {
    // nothing to do: they are in memory either way
  }
}
