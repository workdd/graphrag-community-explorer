import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { typeColors } from "../../core/graph/palette";
import type { EmbeddingIndex } from "../../core/loaders/embeddings";
import type { Dataset } from "../../core/model";
import type { CitedShortIds, Selection } from "../../core/search/highlight";
import { cosine } from "../../core/search/local";
import { boxScale, fitToBox, projectInto } from "../../core/search/projection";
import type { RetrievalObservation } from "../../core/search/run";
import type { SearchContext } from "../../core/search/types";
import { useT } from "../i18n";
import { readableTitle } from "./label";
import { requestProjection, type ProjectionResult } from "./projectionClient";
import { frame, hit, pan, place, START, turn, zoomAt, type Camera, type Placed } from "./spaceView";

interface Props {
  dataset: Dataset;
  embeddings: EmbeddingIndex;
  context: SearchContext;
  cited: CitedShortIds;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** The ranking the run actually did. Absent for an imported run, which carries no query vector. */
  observation: RetrievalObservation | null;
}

interface Point {
  id: string;
  title: string;
  type: string;
  /** Set when this record went to the model in the current run. */
  shortId?: string;
  /** Similarity to the question, for the records the run ranked. */
  score?: number;
}

export function EmbeddingSpace({ dataset, embeddings, context, cited, selection, onSelect, observation }: Props) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const placedRef = useRef<Placed[]>([]);
  const drag = useRef<{ x: number; y: number; panning: boolean } | null>(null);
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>(START);
  const [threeD, setThreeD] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const [onlyType, setOnlyType] = useState<string | null>(null);

  const points = useMemo<Point[]>(() => {
    const inRun = new Map(context.entities.filter((e) => e.id).map((e) => [e.id!, e]));
    const out: Point[] = [];
    for (const id of embeddings.vectors.keys()) {
      const entity = dataset.entities.get(id);
      if (!entity) continue;
      const item = inRun.get(id);
      out.push({ id, title: readableTitle(entity.title), type: entity.type, shortId: item?.shortId, score: item?.score });
    }
    return out;
  }, [dataset, embeddings, context.entities]);

  const colors = useMemo(() => typeColors(points.map((p) => p.type)), [points]);
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [points]);

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
  // The question is not one of the records, so it is placed with the same basis and the same scale.
  // Anything else would put it somewhere the arithmetic never meant.
  const questionAt = useMemo(() => {
    if (!result || !observation) return null;
    try {
      const raw = projectInto(observation.queryVector, result.basis);
      const scale = boxScale(result, 1);
      return [raw[0] * scale, raw[1] * scale, (raw[2] ?? 0) * scale];
    } catch {
      return null;
    }
  }, [result, observation]);
  // A record the ranking chose but the budget then dropped: the picture should not call it "used".
  const dropped = useMemo(() => {
    if (!observation) return new Set<string>();
    const kept = new Set(observation.contextEntityIds);
    return new Set(observation.seeds.map((seed) => seed.id).filter((id) => !kept.has(id)));
  }, [observation]);
  const selectedIndex = useMemo(
    () => (selection?.kind === "entities" ? points.findIndex((p) => p.shortId === selection.shortId) : -1),
    [selection, points],
  );

  /** Cosine against the selected record: a real number, unlike the distance on screen. */
  const similarityTo = useCallback(
    (index: number): number | null => {
      if (selectedIndex < 0 || index === selectedIndex) return null;
      const a = embeddings.vectors.get(points[selectedIndex].id);
      const b = embeddings.vectors.get(points[index].id);
      return a && b ? cosine(a, b) : null;
    },
    [selectedIndex, points, embeddings],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el || !fitted) return;
    const scale = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.round(w * scale);
    el.height = Math.round(h * scale);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const placed = place(fitted, points.length, camera, w, h, threeD);
    placedRef.current = placed;
    const order = [...placed].sort((a, b) => a.depth - b.depth);
    const question = questionAt
      ? place(Float32Array.from(questionAt), 1, camera, w, h, threeD)[0]
      : null;

    // Lines from the question to what the ranking picked, drawn under the points.
    if (question) {
      ctx.strokeStyle = "#c8a95e";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      for (const item of placed) {
        const point = points[item.index];
        if (point.shortId === undefined && !dropped.has(point.id)) continue;
        ctx.beginPath();
        ctx.moveTo(question.x, question.y);
        ctx.lineTo(item.x, item.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (const item of order) {
      const point = points[item.index];
      const muted = onlyType !== null && point.type !== onlyType;
      const isCited = point.shortId !== undefined && cited.entities.has(point.shortId);
      const wasDropped = dropped.has(point.id);
      const inRun = point.shortId !== undefined || wasDropped;
      const picked = item.index === selectedIndex;
      const fade = threeD ? 0.45 + 0.55 * ((item.depth + 1) / 2) : 1;
      ctx.globalAlpha = muted ? 0.06 : inRun ? 1 : 0.5 * fade;
      ctx.fillStyle = colors.get(point.type) ?? "#8c96a0";
      ctx.beginPath();
      ctx.arc(item.x, item.y, isCited ? 7 : inRun ? 5 : 2.4, 0, Math.PI * 2);
      if (wasDropped && point.shortId === undefined) {
        // Chosen by the ranking, cut by the budget: hollow, so it never reads as evidence.
        ctx.globalAlpha = muted ? 0.06 : 1;
        ctx.strokeStyle = "#c8a95e";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fill();
      }
      if ((isCited || picked) && !muted) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = picked ? 3 : 2;
        ctx.strokeStyle = picked ? "#3d5afe" : "#a3423c";
        ctx.stroke();
      }
    }

    if (question) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#b8860b";
      ctx.beginPath();
      ctx.moveTo(question.x, question.y - 8);
      ctx.lineTo(question.x + 8, question.y);
      ctx.lineTo(question.x, question.y + 8);
      ctx.lineTo(question.x - 8, question.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.font = '600 11px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    // Only what the run used gets a name; two thousand names at once is a smudge.
    for (const item of order) {
      const point = points[item.index];
      const worth = (point.shortId !== undefined && cited.entities.has(point.shortId)) || item.index === selectedIndex;
      if (!worth) continue;
      const label = point.title.slice(0, 24);
      const width = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(item.x - width / 2 - 3, item.y - 23, width + 6, 14);
      ctx.fillStyle = "#1b2430";
      ctx.fillText(label, item.x, item.y - 12);
    }
  }, [fitted, points, camera, threeD, cited, selectedIndex, colors, onlyType, questionAt, dropped]);

  const pointerAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const el = canvas.current;
    if (!el) return { px: 0, py: 0 };
    const box = el.getBoundingClientRect();
    return { px: event.clientX - box.left, py: event.clientY - box.top };
  };

  if (failed) return <p className="notice stop">{failed}</p>;
  if (!result || !fitted) {
    return (
      <div className="space-pane">
        <p className="muted">{t("Projecting {count} vectors of {dim} dimensions…", { count: points.length, dim: embeddings.dim })}</p>
      </div>
    );
  }

  const shown = result.variance.slice(0, threeD ? 3 : 2).reduce((a, b) => a + b, 0);
  const readout = hovered !== null ? points[hovered] : selectedIndex >= 0 ? points[selectedIndex] : null;
  const readoutIndex = hovered ?? (selectedIndex >= 0 ? selectedIndex : null);
  const similarity = readoutIndex === null ? null : similarityTo(readoutIndex);

  return (
    <div className="space-pane">
      <div className="space-controls">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={!threeD} className={!threeD ? "active" : ""} onClick={() => setThreeD(false)}>2D</button>
          <button role="tab" aria-selected={threeD} className={threeD ? "active" : ""} onClick={() => setThreeD(true)}>3D</button>
        </div>
        <button className="btn" onClick={() => setCamera(START)}>{t("Fit")}</button>
        <button
          className="btn"
          disabled={cited.entities.size === 0}
          onClick={() => {
            const el = canvas.current;
            if (!el) return;
            const indexes = points.map((p, i) => (p.shortId !== undefined && cited.entities.has(p.shortId) ? i : -1)).filter((i) => i >= 0);
            setCamera((c) => frame(placedRef.current, indexes, c, el.clientWidth, el.clientHeight));
          }}
        >
          {t("Zoom to the cited")}
        </button>
        <span className="muted">
          {t("{shown} of the spread is on screen; {hidden} is not.", {
            shown: `${(shown * 100).toFixed(1)}%`,
            hidden: `${((1 - shown) * 100).toFixed(1)}%`,
          })}
        </span>
      </div>

      <canvas
        ref={canvas}
        className="canvas"
        onWheel={(e) => {
          const { px, py } = pointerAt(e);
          const el = canvas.current;
          if (!el) return;
          setCamera((c) => zoomAt(c, e.deltaY < 0 ? 1.15 : 1 / 1.15, px, py, el.clientWidth / 2, el.clientHeight / 2));
        }}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, panning: e.shiftKey || e.button === 1 || !threeD }; }}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; setHovered(null); }}
        onMouseMove={(e) => {
          if (drag.current) {
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
            const panning = drag.current.panning;
            setCamera((c) => (panning ? pan(c, dx, dy) : turn(c, dx, dy)));
            return;
          }
          const { px, py } = pointerAt(e);
          setHovered(hit(placedRef.current, px, py));
        }}
        onClick={(e) => {
          const { px, py } = pointerAt(e);
          const index = hit(placedRef.current, px, py);
          const shortId = index === null ? undefined : points[index].shortId;
          onSelect(shortId === undefined ? null : { kind: "entities", shortId });
        }}
      />

      <div className="space-readout">
        {readout ? (
          <>
            <b>{readout.title}</b>
            <span className="tag" style={{ borderColor: colors.get(readout.type) }}>{readout.type}</span>
            {readout.score !== undefined ? <span>{t("Question similarity")} <b>{readout.score.toFixed(3)}</b></span> : null}
            {similarity !== null ? <span>{t("Similarity to the selected")} <b>{similarity.toFixed(3)}</b></span> : null}
            {readout.shortId === undefined ? <span className="muted">{t("Not in this run")}</span> : null}
          </>
        ) : (
          <span className="muted">{threeD ? t("Drag to turn, shift-drag to move, wheel to zoom") : t("Drag to move, wheel to zoom")}</span>
        )}
      </div>

      {observation ? (
        <table className="space-ranking">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("Ranked by the question")}</th>
              <th>{t("Cosine")}</th>
            </tr>
          </thead>
          <tbody>
            {observation.seeds.map((seed, i) => {
              const point = points.find((entry) => entry.id === seed.id);
              const picked = point?.shortId !== undefined && selection?.shortId === point.shortId;
              return (
                <tr
                  key={seed.id}
                  className={`${picked ? "picked" : ""} ${dropped.has(seed.id) ? "dropped" : ""}`.trim()}
                  onClick={() => onSelect(point?.shortId === undefined ? null : { kind: "entities", shortId: point.shortId })}
                >
                  <td className="n">{i + 1}</td>
                  <td>
                    {readableTitle(seed.title)}
                    <span className="muted"> {dropped.has(seed.id) ? t("cut by the budget") : t("in the prompt")}</span>
                  </td>
                  <td className="s">{seed.score.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <div className="space-types">
        {types.slice(0, 12).map(([type, count]) => (
          <button
            key={type}
            className={`legend-item${onlyType === type ? " on" : ""}`}
            onClick={() => setOnlyType(onlyType === type ? null : type)}
            title={t("Show only this type")}
          >
            <i className="dot" style={{ background: colors.get(type) }} />
            {type} <span className="muted">{count}</span>
          </button>
        ))}
      </div>

      {observation ? (
        <p className="muted legend-space">
          <i className="q" /> {t("the question")} <i className="kept" /> {t("in the prompt")} <i className="cut" /> {t("cut by the budget")}
        </p>
      ) : null}

      <p className="muted caveat">
        {t("Distance on screen is not the cosine similarity the search used. Vectors are scaled to unit length and reduced with PCA, so records that overlap here can still be far apart, and the axes carry no business meaning.")}
      </p>
    </div>
  );
}
