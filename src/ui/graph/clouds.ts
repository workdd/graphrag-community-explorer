import type cytoscape from "cytoscape";
import { placeLabels, type LabelCandidate } from "../../core/graph/labels";

export interface CloudGroup {
  id: string;
  label: string;
  /** CSS colors; the fill should already carry its alpha. */
  fill: string;
  stroke: string;
  /** Cytoscape element ids whose rendered positions the cloud wraps. */
  elementIds: string[];
  /** Ancestor communities: drawn first, larger padding, dashed outline. */
  outer?: boolean;
  /** How many records the community holds. Decides which name survives a crowd. */
  weight?: number;
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

interface PendingName {
  id: string;
  text: string;
  /** Top of the cloud, in screen pixels. */
  x: number;
  y: number;
  stroke: string;
  weight: number;
}

/** Names are drawn at this size on screen whatever the zoom, so the whole graph stays readable. */
const NAME_SIZE = 12;
const NAME_FONT = `600 ${NAME_SIZE}px system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
/** A name wider than this is cut; a long community title would otherwise cover its neighbours. */
const NAME_MAX = 190;

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Cuts a name to the width a label may take, ending in an ellipsis. */
function clip(ctx: CanvasRenderingContext2D, text: string): string {
  if (ctx.measureText(text).width <= NAME_MAX) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}\u2026`).width > NAME_MAX) cut = cut.slice(0, -1);
  return `${cut}\u2026`;
}

/**
 * Every community is named, at a steady size, whether the graph is zoomed right out or right in.
 * Where two names would land on top of each other the smaller community gives way, and zooming in
 * spreads the clouds apart until it gets its name back.
 */
function drawNames(ctx: CanvasRenderingContext2D, names: PendingName[]): number {
  if (names.length === 0) return 0;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = NAME_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const height = NAME_SIZE + 9;
  const boxes = new Map<string, { text: string; candidate: LabelCandidate; stroke: string }>();
  const candidates: LabelCandidate[] = [];
  for (const name of names) {
    const text = clip(ctx, name.text);
    const candidate: LabelCandidate = {
      id: name.id,
      x: name.x,
      y: name.y - height / 2 - 3,
      width: ctx.measureText(text).width + 16,
      height,
      priority: name.weight,
    };
    candidates.push(candidate);
    boxes.set(name.id, { text, candidate, stroke: name.stroke });
  }
  const { shown } = placeLabels(candidates, 120);
  for (const id of shown) {
    const box = boxes.get(id);
    if (!box) continue;
    const { candidate } = box;
    pill(ctx, candidate.x - candidate.width / 2, candidate.y - candidate.height / 2, candidate.width, candidate.height);
    ctx.fillStyle = "rgba(255, 254, 251, 0.92)";
    ctx.fill();
    ctx.strokeStyle = box.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#1b2430";
    ctx.fillText(box.text, candidate.x, candidate.y + 0.5);
  }
  ctx.restore();
  return shown.size;
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
    const basePadding = Math.max(14, 26 * zoom);
    const pending: PendingName[] = [];
    for (const group of getGroups()) {
      const padding = group.outer ? basePadding * 1.9 : basePadding;
      ctx.setLineDash(group.outer ? [6, 5] : []);
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
      pending.push({ id: group.id, text: group.label, x: top.x, y: top.y, stroke: group.stroke, weight: group.weight ?? group.elementIds.length });
    }
    // How many community names the canvas is carrying right now, so a test can say whether the
    // whole graph in view still names what it is made of.
    canvas.dataset.names = String(drawNames(ctx, pending));
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
export function cloudColors(index: number, outer = false): { fill: string; stroke: string } {
  const hue = Math.round((index * 137.508 + 90) % 360);
  return outer
    ? { fill: `hsla(${hue}, 40%, 60%, 0.07)`, stroke: `hsla(${hue}, 35%, 45%, 0.45)` }
    : { fill: `hsla(${hue}, 55%, 55%, 0.16)`, stroke: `hsla(${hue}, 45%, 40%, 0.55)` };
}
