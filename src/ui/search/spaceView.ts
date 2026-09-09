// Camera maths for the embedding space, kept apart from the drawing so it can be checked. The
// projection is orthographic on purpose: perspective would make depth read as distance in the data,
// and distance in the data is the one thing this picture must not overstate.

export interface Camera {
  /** Radians about the vertical axis. */
  yaw: number;
  /** Radians about the horizontal axis, clamped so the cloud never flips. */
  pitch: number;
  zoom: number;
  /** Pan in screen pixels. */
  panX: number;
  panY: number;
}

export const START: Camera = { yaw: 0.6, pitch: 0.35, zoom: 1, panX: 0, panY: 0 };

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 40;
const MAX_PITCH = 1.4;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
export const clampPitch = (pitch: number): number => Math.min(MAX_PITCH, Math.max(-MAX_PITCH, pitch));

export const turn = (camera: Camera, dx: number, dy: number): Camera => ({
  ...camera,
  yaw: camera.yaw + dx * 0.008,
  pitch: clampPitch(camera.pitch + dy * 0.008),
});

export const pan = (camera: Camera, dx: number, dy: number): Camera => ({
  ...camera,
  panX: camera.panX + dx,
  panY: camera.panY + dy,
});

/**
 * Zoom about the pointer, so the record under the cursor stays under it. Zooming about the centre
 * pushes whatever the reader is looking at off the screen, which is the opposite of the point.
 */
export function zoomAt(camera: Camera, factor: number, px: number, py: number, cx: number, cy: number): Camera {
  const next = clampZoom(camera.zoom * factor);
  const applied = next / camera.zoom;
  // Screen position of the cursor relative to the current centre, before and after the scale.
  const ox = px - (cx + camera.panX);
  const oy = py - (cy + camera.panY);
  return { ...camera, zoom: next, panX: camera.panX + ox * (1 - applied), panY: camera.panY + oy * (1 - applied) };
}

export interface Placed {
  index: number;
  x: number;
  y: number;
  /** Larger is nearer the viewer. Used for draw order and for fading the far side. */
  depth: number;
}

/**
 * Turns unit-box coordinates into screen positions. `coords` is row-major with three values a row;
 * the third is ignored in two dimensions rather than dropped from the data, so the toggle costs
 * nothing but a redraw.
 */
export function place(
  coords: Float32Array,
  count: number,
  camera: Camera,
  width: number,
  height: number,
  threeD: boolean,
): Placed[] {
  const radius = Math.min(width, height) * 0.42 * camera.zoom;
  const cx = width / 2 + camera.panX;
  const cy = height / 2 + camera.panY;
  const cosYaw = Math.cos(camera.yaw), sinYaw = Math.sin(camera.yaw);
  const cosPitch = Math.cos(camera.pitch), sinPitch = Math.sin(camera.pitch);
  const out: Placed[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = coords[i * 3];
    const y = coords[i * 3 + 1];
    const z = threeD ? coords[i * 3 + 2] : 0;
    const rx = x * cosYaw + z * sinYaw;
    const rz = -x * sinYaw + z * cosYaw;
    const ry = y * cosPitch - rz * sinPitch;
    const depth = threeD ? y * sinPitch + rz * cosPitch : 0;
    out[i] = { index: i, x: cx + rx * radius, y: cy - ry * radius, depth };
  }
  return out;
}

/** Index of the point under the pointer, or null. Nearest wins inside the radius. */
export function hit(placed: Placed[], px: number, py: number, radius = 9): number | null {
  let best: { d: number; index: number } | null = null;
  const limit = radius * radius;
  for (const item of placed) {
    const d = (item.x - px) ** 2 + (item.y - py) ** 2;
    if (d <= limit && (!best || d < best.d)) best = { d, index: item.index };
  }
  return best?.index ?? null;
}

/** Pan and zoom that bring the given points into view, leaving the rotation alone. */
export function frame(placed: Placed[], indexes: number[], camera: Camera, width: number, height: number): Camera {
  const chosen = indexes.map((i) => placed[i]).filter(Boolean);
  if (chosen.length === 0) return camera;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const item of chosen) {
    minX = Math.min(minX, item.x); maxX = Math.max(maxX, item.x);
    minY = Math.min(minY, item.y); maxY = Math.max(maxY, item.y);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const factor = Math.min((width * 0.6) / spanX, (height * 0.6) / spanY);
  const zoom = clampZoom(camera.zoom * factor);
  const applied = zoom / camera.zoom;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    ...camera,
    zoom,
    panX: camera.panX + (width / 2 - midX) * applied,
    panY: camera.panY + (height / 2 - midY) * applied,
  };
}
