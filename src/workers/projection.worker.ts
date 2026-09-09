import { project, type Matrix, type Projection } from "../core/search/projection";

export interface ProjectionJob {
  id: number;
  ids: string[];
  values: Float32Array;
  dim: number;
  axes: number;
  iterations: number;
}

export interface ProjectionDone extends Projection {
  id: number;
  ms: number;
}

self.onmessage = (event: MessageEvent<ProjectionJob>) => {
  const job = event.data;
  const started = Date.now();
  const matrix: Matrix = { ids: job.ids, values: job.values, dim: job.dim };
  const result = project(matrix, job.axes, job.iterations);
  const done: ProjectionDone = { ...result, id: job.id, ms: Date.now() - started };
  // The coordinates are the only large buffer left; handing it over avoids copying it back.
  self.postMessage(done, { transfer: [done.coords.buffer] });
};
