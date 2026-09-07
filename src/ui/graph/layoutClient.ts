import type cytoscape from "cytoscape";
import { computeLayout, type LayoutJob, type LayoutProfile, type LayoutResult } from "../../core/graph/headlessLayout";

type Positions = Record<string, { x: number; y: number }>;

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (result: LayoutResult) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("../../workers/layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<LayoutResult>) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
    worker.onerror = () => {
      // Fall back to the main thread for everything still in flight and from now on.
      for (const [id, resolve] of pending) resolve({ id, positions: {}, ms: 0, error: "worker failed" });
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Layout off the main thread when possible; the fallback keeps the feature working everywhere. */
export async function requestLayout(profile: LayoutProfile, elements: cytoscape.ElementDefinition[], incremental: boolean, seed: string): Promise<LayoutResult & { where: "worker" | "main" }> {
  const job: LayoutJob = { id: nextId++, profile, elements, incremental, seed };
  const w = getWorker();
  if (w) {
    const result = await new Promise<LayoutResult>((resolve) => {
      pending.set(job.id, resolve);
      w.postMessage(job);
    });
    if (!result.error) return { ...result, where: "worker" };
  }
  return { ...computeLayout(job), where: "main" };
}

const DB = "graphrag-community-explorer";
const STORE = "layouts";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadCachedLayout(key: string): Promise<Positions | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as Positions | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function saveCachedLayout(key: string, positions: Positions): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(positions, key);
  } catch {
    // cache is best effort
  }
}
