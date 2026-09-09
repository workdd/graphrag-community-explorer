// Projecting a few thousand vectors of a few thousand dimensions takes seconds. On the main thread
// that is a frozen tab, so it runs in a worker, with the same computation on the main thread as the
// fallback for anywhere a worker cannot start.
import { project, type Matrix, type Projection } from "../../core/search/projection";
import type { ProjectionDone, ProjectionJob } from "../../workers/projection.worker";

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (done: ProjectionDone) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("../../workers/projection.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ProjectionDone>) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
    worker.onerror = () => {
      for (const [, resolve] of pending) resolve({ id: 0, ids: [], coords: new Float32Array(), axes: 0, variance: [], ms: 0 });
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export interface ProjectionResult extends Projection {
  ms: number;
  /** True when the work ran on the main thread because no worker was available. */
  onMainThread: boolean;
}

export async function requestProjection(matrix: Matrix, axes = 3, iterations = 8): Promise<ProjectionResult> {
  const w = getWorker();
  if (!w) {
    const started = Date.now();
    const result = project(matrix, axes, iterations);
    return { ...result, ms: Date.now() - started, onMainThread: true };
  }
  const id = nextId;
  nextId += 1;
  const job: ProjectionJob = { id, ids: matrix.ids, values: matrix.values, dim: matrix.dim, axes, iterations };
  const done = await new Promise<ProjectionDone>((resolve) => {
    pending.set(id, resolve);
    // The matrix is rewritten in place by the projection, so it is handed over rather than copied.
    w.postMessage(job, [job.values.buffer]);
  });
  return { ...done, onMainThread: false };
}
