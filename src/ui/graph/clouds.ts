import type cytoscape from "cytoscape";

export interface CloudGroup {
  id: string;
  label: string;
  /** CSS colors; the fill should already carry its alpha. */
  fill: string;
  stroke: string;
  /** Cytoscape element ids whose rendered positions the cloud wraps. */
  elementIds: string[];
}

type Point = { x: number; y: number; r: number };

/** Andrew's monotone chain; returns the hull counter-clockwise. */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Pushes every hull vertex away from the centroid so the outline clears the node circles and labels. */
function inflate(hull: Point[], padding: number): { x: number; y: number }[] {
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const pad = padding + p.r;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
}

/** Closed smooth outline through the midpoints of the polygon edges. */
function tracePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  const n = pts.length;
  const mid = (i: number) => ({ x: (pts[i].x + pts[(i + 1) % n].x) / 2, y: (pts[i].y + pts[(i + 1) % n].y) / 2 });
  ctx.beginPath();
  const start = mid(n - 1);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const m = mid(i);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  ctx.closePath();
}

/**
 * Draws translucent clouds around groups of nodes on a canvas that sits under the Cytoscape
 * layers, redrawn on every render so pan, zoom and drag keep them in place. Returns a detach function.
 */
export function attachClouds(cy: cytoscape.Core, wrap: HTMLElement, getGroups: () => CloudGroup[]): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "cloud-layer";
  wrap.insertBefore(canvas, wrap.firstChild);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => undefined;
  }

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const zoom = cy.zoom();
    const padding = Math.max(14, 26 * zoom);
    for (const group of getGroups()) {
      const points: Point[] = [];
      for (const id of group.elementIds) {
        const node = cy.getElementById(id);
        if (node.empty() || !node.isNode()) continue;
        const p = node.renderedPosition();
        points.push({ x: p.x, y: p.y, r: Math.max(node.renderedWidth(), node.renderedHeight()) / 2 });
      }
      if (points.length === 0) continue;
      ctx.fillStyle = group.fill;
      ctx.strokeStyle = group.stroke;
      ctx.lineWidth = 1.5;
      let top: { x: number; y: number };
      if (points.length === 1) {
        const p = points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + padding, 0, Math.PI * 2);
        top = { x: p.x, y: p.y - p.r - padding };
      } else if (points.length === 2) {
        const [a, b] = points;
        const rad = Math.max(a.r, b.r) + padding;
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.beginPath();
        ctx.arc(a.x, a.y, rad, angle + Math.PI / 2, angle - Math.PI / 2);
        ctx.arc(b.x, b.y, rad, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        top = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - rad };
      } else {
        const outline = inflate(convexHull(points), padding);
        tracePath(ctx, outline);
        const topPoint = outline.reduce((best, p) => (p.y < best.y ? p : best), outline[0]);
        top = { x: outline.reduce((s, p) => s + p.x, 0) / outline.length, y: topPoint.y };
      }
      ctx.fill();
      ctx.stroke();
      if (zoom >= 0.35) {
        ctx.font = `600 ${Math.max(11, Math.min(14, 12 * zoom))}px system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "#1b2430";
        ctx.fillText(group.label, top.x, top.y - 4);
      }
    }
  };

  cy.on("render", draw);
  const observer = new ResizeObserver(draw);
  observer.observe(wrap);
  draw();
  return () => {
    cy.off("render", draw);
    observer.disconnect();
    canvas.remove();
  };
}

/** Distinct, soft colors per group: golden-angle hues, low alpha fill and a firmer stroke. */
export function cloudColors(index: number): { fill: string; stroke: string } {
  const hue = Math.round((index * 137.508 + 90) % 360);
  return { fill: `hsla(${hue}, 55%, 55%, 0.16)`, stroke: `hsla(${hue}, 45%, 40%, 0.55)` };
}
