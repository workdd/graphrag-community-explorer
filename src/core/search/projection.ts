// Entity vectors are thousands of dimensions wide. A screen has two, or three if it turns. This
// projects them with PCA and reports how much of the spread each axis actually carries, because the
// honest part of the picture is the share it leaves out.

export interface Matrix {
  ids: string[];
  /** Row-major, ids.length rows of `dim` values. */
  values: Float32Array;
  dim: number;
}

export interface Projection {
  ids: string[];
  /** Row-major, ids.length rows of `axes` values. */
  coords: Float32Array;
  axes: number;
  /** Share of the total spread each axis carries, 0 to 1, in order. */
  variance: number[];
}

/** Cosine similarity ignores length, so the projection should too. A zero vector stays zero. */
export function normalizeRows(m: Matrix): void {
  for (let row = 0; row < m.ids.length; row += 1) {
    const at = row * m.dim;
    let norm = 0;
    for (let j = 0; j < m.dim; j += 1) norm += m.values[at + j] ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    for (let j = 0; j < m.dim; j += 1) m.values[at + j] /= norm;
  }
}

/** PCA measures spread about the centre, so the centre has to be the origin first. */
export function centreRows(m: Matrix): Float64Array {
  const mean = new Float64Array(m.dim);
  const rows = m.ids.length;
  if (rows === 0) return mean;
  for (let row = 0; row < rows; row += 1) {
    const at = row * m.dim;
    for (let j = 0; j < m.dim; j += 1) mean[j] += m.values[at + j];
  }
  for (let j = 0; j < m.dim; j += 1) mean[j] /= rows;
  for (let row = 0; row < rows; row += 1) {
    const at = row * m.dim;
    for (let j = 0; j < m.dim; j += 1) m.values[at + j] -= mean[j];
  }
  return mean;
}

const dotRow = (m: Matrix, row: number, v: Float64Array): number => {
  const at = row * m.dim;
  let sum = 0;
  for (let j = 0; j < m.dim; j += 1) sum += m.values[at + j] * v[j];
  return sum;
};

export const totalSpread = (m: Matrix): number => {
  let sum = 0;
  for (let i = 0; i < m.values.length; i += 1) sum += m.values[i] ** 2;
  return sum;
};

/**
 * Top components by power iteration on the data matrix. The covariance matrix would be dim by dim,
 * which is sixteen million entries at four thousand dimensions; this never forms it. Measured on a
 * 2,674 by 4,096 index, eight passes land the explained variance on the same first decimal as
 * twenty-four, so the default stops there.
 */
const COLLAPSE_TOLERANCE = 1e-7;

export function topComponents(m: Matrix, axes: number, iterations = 8): Float64Array[] {
  const found: Float64Array[] = [];
  if (m.ids.length === 0 || m.dim === 0) return found;
  for (let k = 0; k < axes; k += 1) {
    // A fixed start keeps the picture the same every time the same file is opened.
    let v = new Float64Array(m.dim);
    for (let j = 0; j < m.dim; j += 1) v[j] = Math.sin(j * (k + 1) + 1);
    let collapsed = false;
    for (let step = 0; step < iterations; step += 1) {
      const next = new Float64Array(m.dim);
      for (let row = 0; row < m.ids.length; row += 1) {
        const weight = dotRow(m, row, v);
        const at = row * m.dim;
        for (let j = 0; j < m.dim; j += 1) next[j] += weight * m.values[at + j];
      }
      let before = 0;
      for (let j = 0; j < m.dim; j += 1) before += next[j] ** 2;
      before = Math.sqrt(before);
      for (const previous of found) {
        let overlap = 0;
        for (let j = 0; j < m.dim; j += 1) overlap += next[j] * previous[j];
        for (let j = 0; j < m.dim; j += 1) next[j] -= overlap * previous[j];
      }
      let norm = 0;
      for (let j = 0; j < m.dim; j += 1) norm += next[j] ** 2;
      norm = Math.sqrt(norm);
      // Exact zero almost never happens: what is left after deflation is rounding noise. Normalizing
      // that would turn noise into an axis and hand it a share of the variance.
      if (norm <= before * COLLAPSE_TOLERANCE) {
        // Nothing is left in this direction. Returning the starting guess would draw coordinates and
        // report variance for an axis the data does not have, so the axis comes back empty instead.
        collapsed = true;
        break;
      }
      for (let j = 0; j < m.dim; j += 1) next[j] /= norm;
      v = next;
    }
    found.push(collapsed ? new Float64Array(m.dim) : v);
  }
  return found;
}

/** Normalizes, centres and projects. The input matrix is consumed: it is rewritten in place. */
export function project(m: Matrix, axes = 3, iterations = 8): Projection {
  normalizeRows(m);
  centreRows(m);
  const total = totalSpread(m);
  const components = topComponents(m, axes, iterations);
  const rows = m.ids.length;
  const coords = new Float32Array(rows * axes);
  const spread = new Array<number>(axes).fill(0);
  for (let row = 0; row < rows; row += 1) {
    for (let k = 0; k < components.length; k += 1) {
      const value = dotRow(m, row, components[k]);
      coords[row * axes + k] = value;
      spread[k] += value * value;
    }
  }
  return {
    ids: m.ids,
    coords,
    axes,
    variance: spread.map((s) => (total > 0 ? s / total : 0)),
  };
}

/** Coordinates scaled into a box of the given half-width, so the view does not depend on the data's units. */
export function fitToBox(projection: Projection, half = 1): Float32Array {
  const out = new Float32Array(projection.coords.length);
  let largest = 0;
  for (const value of projection.coords) largest = Math.max(largest, Math.abs(value));
  const scale = largest > 0 ? half / largest : 0;
  for (let i = 0; i < out.length; i += 1) out[i] = projection.coords[i] * scale;
  return out;
}
