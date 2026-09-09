import { useEffect, useMemo, useRef, useState } from "react";
import { typeColors } from "../../core/graph/palette";
import type { EmbeddingIndex } from "../../core/loaders/embeddings";
import type { Dataset } from "../../core/model";
import type { CitedShortIds, Selection } from "../../core/search/highlight";
import { fitToBox } from "../../core/search/projection";
import type { SearchContext } from "../../core/search/types";
import { useT } from "../i18n";
import { readableTitle } from "./label";
import { requestProjection, type ProjectionResult } from "./projectionClient";

interface Props {
  dataset: Dataset;
  embeddings: EmbeddingIndex;
  context: SearchContext;
  cited: CitedShortIds;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

interface Point {
  id: string;
  title: string;
  type: string;
  /** Set when this record went to the model in the current run. */
  shortId?: string;
}

const DOT = 2.4;
const SEED_DOT = 5;
const CITED_DOT = 7;

export function EmbeddingSpace({ dataset, embeddings, context, cited, selection, onSelect }: Props) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [spin, setSpin] = useState({ yaw: 0.6, pitch: 0.35 });
  const [threeD, setThreeD] = useState(true);
  const [hover, setHover] = useState<Point | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const points = useMemo<Point[]>(() => {
    const byId = new Map(context.entities.filter((e) => e.id).map((e) => [e.id!, e.shortId]));
    const out: Point[] = [];
    for (const id of embeddings.vectors.keys()) {
      const entity = dataset.entities.get(id);
      if (!entity) continue;
      out.push({ id, title: readableTitle(entity.title), type: entity.type, shortId: byId.get(id) });
    }
    return out;
  }, [dataset, embeddings, context.entities]);

  useEffect(() => {
    let alive = true;
    setResult(null);
    setFailed(null);
    const ids = points.map((p) => p.id);
    const values = new Float32Array(ids.length * embeddings.dim);
    ids.forEach((id, row) => values.set(embeddings.vectors.get(id)!, row * embeddings.dim));
    requestProjection({ ids, values, dim: embeddings.dim }, 3, 8)
      .then((r) => { if (alive) setResult(r); })
      .catch((error: unknown) => { if (alive) setFailed(error instanceof Error ? error.message : String(error)); });
    return () => { alive = false; };
  }, [points, embeddings]);

  const fitted = useMemo(() => (result ? fitToBox(result, 1) : null), [result]);
  // One colour per entity type, assigned the same way the other views assign it.
  const colors = useMemo(() => typeColors(points.map((p) => p.type)), [points]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !fitted || !result) return;
    const scale = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.round(w * scale);
    el.height = Math.round(h * scale);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const radius = Math.min(w, h) * 0.42;
    const cy = Math.cos(spin.yaw), sy = Math.sin(spin.yaw);
    const cp = Math.cos(spin.pitch), sp = Math.sin(spin.pitch);
    const placed: { x: number; y: number; depth: number; point: Point }[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const x = fitted[i * 3], y = fitted[i * 3 + 1], z = threeD ? fitted[i * 3 + 2] : 0;
      // Orthographic on purpose: perspective would make depth look like distance in the data.
      const rx = x * cy + z * sy;
      const rz = -x * sy + z * cy;
      const ry = y * cp - rz * sp;
      const depth = y * sp + rz * cp;
      placed.push({ x: w / 2 + rx * radius, y: h / 2 - ry * radius, depth, point: points[i] });
    }
    placed.sort((a, b) => a.depth - b.depth);

    for (const item of placed) {
      const isCited = item.point.shortId !== undefined && cited.entities.has(item.point.shortId);
      const isSeed = item.point.shortId !== undefined;
      const picked = selection?.kind === "entities" && selection.shortId === item.point.shortId;
      const fade = threeD ? 0.45 + 0.55 * ((item.depth + 1) / 2) : 1;
      ctx.globalAlpha = isSeed ? 1 : 0.5 * fade;
      ctx.fillStyle = colors.get(item.point.type) ?? "#8c96a0";
      ctx.beginPath();
      ctx.arc(item.x, item.y, isCited ? CITED_DOT : isSeed ? SEED_DOT : DOT, 0, Math.PI * 2);
      ctx.fill();
      if (isCited || picked) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = picked ? 3 : 2;
        ctx.strokeStyle = picked ? "#3d5afe" : "#a3423c";
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // Only the records this run used get a name; every name at once is a smudge.
    ctx.font = '600 11px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    for (const item of placed) {
      if (item.point.shortId === undefined) continue;
      if (!cited.entities.has(item.point.shortId) && !(selection?.shortId === item.point.shortId)) continue;
      const label = item.point.title.slice(0, 22);
      const width = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(item.x - width / 2 - 3, item.y - CITED_DOT - 16, width + 6, 14);
      ctx.fillStyle = "#1b2430";
      ctx.fillText(label, item.x, item.y - CITED_DOT - 5);
    }
    (el as HTMLCanvasElement & { _placed?: typeof placed })._placed = placed;
  }, [fitted, result, points, spin, threeD, cited, selection, colors]);

  const nearest = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const el = canvas.current as (HTMLCanvasElement & { _placed?: { x: number; y: number; point: Point }[] }) | null;
    const placed = el?._placed;
    if (!el || !placed) return null;
    const box = el.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    let best: { d: number; point: Point } | null = null;
    for (const item of placed) {
      const d = (item.x - px) ** 2 + (item.y - py) ** 2;
      if (d < 144 && (!best || d < best.d)) best = { d, point: item.point };
    }
    return best?.point ?? null;
  };

  if (failed) return <p className="notice stop">{failed}</p>;
  if (!result) {
    return (
      <div className="space-pane">
        <p className="muted">{t("Projecting {count} vectors of {dim} dimensions…", { count: points.length, dim: embeddings.dim })}</p>
      </div>
    );
  }

  const shown = result.variance.slice(0, threeD ? 3 : 2).reduce((a, b) => a + b, 0);

  return (
    <div className="space-pane">
      <canvas
        ref={canvas}
        className="canvas"
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; }}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; setHover(null); }}
        onMouseMove={(e) => {
          if (drag.current && threeD) {
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setSpin((s) => ({ yaw: s.yaw + dx * 0.008, pitch: Math.max(-1.4, Math.min(1.4, s.pitch + dy * 0.008)) }));
            return;
          }
          setHover(nearest(e));
        }}
        onClick={(e) => {
          const point = nearest(e);
          onSelect(point?.shortId === undefined ? null : { kind: "entities", shortId: point.shortId });
        }}
      />
      <div className="legend">
        <button className="btn" onClick={() => setThreeD((v) => !v)}>{threeD ? t("Show 2D") : t("Show 3D")}</button>
        <span>
          {t("{shown} of the spread is on screen; {hidden} is not.", {
            shown: `${(shown * 100).toFixed(1)}%`,
            hidden: `${((1 - shown) * 100).toFixed(1)}%`,
          })}
        </span>
        {hover ? <b>{hover.title}</b> : threeD ? <span className="muted">{t("Drag to turn")}</span> : null}
      </div>
      <p className="muted caveat">
        {t("Distance on screen is not the cosine similarity the search used. Vectors are scaled to unit length and reduced with PCA, so records that overlap here can still be far apart, and the axes carry no business meaning.")}
      </p>
    </div>
  );
}
