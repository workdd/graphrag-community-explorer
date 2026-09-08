import { useEffect, useMemo, useRef, useState } from "react";
import { displayTitle, typeColors } from "../../core/graph/palette";
import { buildMatrix, type MatrixModel } from "../../core/graph/matrix";
import { schemaGraph } from "../../core/graph/schemaGraph";
import type { Dataset } from "../../core/model";
import { fmt } from "../format";
import { useT } from "../i18n";

interface Props {
  dataset: Dataset;
  /** The pair of entity types to cross. Every relationship between them is drawn at once. */
  pair: { from: string; to: string };
  onPair: (pair: { from: string; to: string }) => void;
  onFocusEntity: (entityId: string) => void;
  onExplore: (entityId: string) => void;
}

const CELL = 15;
const GUTTER = 210;
const HEADER = 128;
const LIMITS = { rows: 400, cols: 400 };

type Hover = { row: number; col: number } | null;

/**
 * A pair of entity types as a grid: rows are one type, columns the other, and a filled cell is a
 * relationship. This is the readable form of a dense triple, where arrows only ever give a hairball.
 */
export function MatrixView({ dataset, pair, onPair, onFocusEntity, onExplore }: Props) {
  const { t } = useT();
  const schema = useMemo(() => schemaGraph(dataset), [dataset]);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<Hover>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Every pair of types that has relationships, densest first: those are the ones worth a grid.
  const pairs = useMemo(() => {
    const seen = new Map<string, { from: string; to: string; count: number; density: number; names: string[] }>();
    for (const edge of schema.edges) {
      const key = `${edge.from}>${edge.to}`;
      const found = seen.get(key);
      if (found) {
        found.count += edge.count;
        found.density = Math.max(found.density, edge.density);
        found.names.push(edge.relationship);
      } else seen.set(key, { from: edge.from, to: edge.to, count: edge.count, density: edge.density, names: [edge.relationship] });
    }
    return [...seen.values()].sort((a, b) => b.density - a.density || b.count - a.count);
  }, [schema]);

  const names = useMemo(() => pairs.find((entry) => entry.from === pair.from && entry.to === pair.to)?.names ?? [], [pairs, pair]);
  const colors = useMemo(() => typeColors(names), [names]);
  const model: MatrixModel = useMemo(() => buildMatrix(dataset, pair.from, pair.to, names, LIMITS), [dataset, pair, names]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return model.rows.map((entity, index) => ({ entity, index }));
    return model.rows.map((entity, index) => ({ entity, index })).filter((row) => row.entity.title.toLowerCase().includes(needle));
  }, [model, query]);

  const width = GUTTER + model.cols.length * CELL;
  const height = HEADER + rows.length * CELL;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(width * dpr));
    element.height = Math.max(1, Math.round(height * dpr));
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.font = '11px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    context.textBaseline = "middle";

    // Column names lean over so long menu names still fit above a fifteen pixel column.
    context.save();
    context.fillStyle = "#5f6b78";
    model.cols.forEach((entity, c) => {
      const x = GUTTER + c * CELL + CELL / 2;
      context.save();
      context.translate(x, HEADER - 6);
      context.rotate(-Math.PI / 3);
      context.textAlign = "left";
      const label = displayTitle(entity);
      context.fillText(label.length > 22 ? `${label.slice(0, 21)}…` : label, 0, 0);
      context.restore();
    });
    context.restore();

    context.textAlign = "right";
    rows.forEach((row, r) => {
      const y = HEADER + r * CELL + CELL / 2;
      context.fillStyle = hover?.row === r ? "#1b2430" : "#3a3a36";
      const label = displayTitle(row.entity);
      context.fillText(label.length > 28 ? `${label.slice(0, 27)}…` : label, GUTTER - 8, y);
    });

    context.strokeStyle = "#ebeee8";
    context.lineWidth = 1;
    for (let c = 0; c <= model.cols.length; c++) {
      const x = Math.round(GUTTER + c * CELL) + 0.5;
      context.beginPath();
      context.moveTo(x, HEADER);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let r = 0; r <= rows.length; r++) {
      const y = Math.round(HEADER + r * CELL) + 0.5;
      context.beginPath();
      context.moveTo(GUTTER, y);
      context.lineTo(width, y);
      context.stroke();
    }

    rows.forEach((row, r) => {
      for (let c = 0; c < model.cols.length; c++) {
        const mask = model.cells.get(row.index * model.cols.length + c) ?? 0;
        if (mask === 0) continue;
        const present = names.filter((_, i) => (mask & (1 << i)) !== 0);
        const band = CELL / present.length;
        present.forEach((name, i) => {
          context.fillStyle = colors.get(name) ?? "#8c96a0";
          context.fillRect(GUTTER + c * CELL + 1, HEADER + r * CELL + 1 + i * band, CELL - 2, band - (i === present.length - 1 ? 2 : 0));
        });
      }
    });

    if (hover) {
      context.fillStyle = "rgba(90, 111, 190, 0.14)";
      context.fillRect(GUTTER, HEADER + hover.row * CELL, width - GUTTER, CELL);
      context.fillRect(GUTTER + hover.col * CELL, HEADER, CELL, height - HEADER);
    }
  }, [model, rows, names, colors, hover, width, height]);

  const at = (event: React.MouseEvent<HTMLCanvasElement>): Hover => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < GUTTER || y < HEADER) return null;
    const col = Math.floor((x - GUTTER) / CELL);
    const row = Math.floor((y - HEADER) / CELL);
    if (row < 0 || row >= rows.length || col < 0 || col >= model.cols.length) return null;
    return { row, col };
  };

  // Every pair being filled is common for a permission block; what matters then is which grant.
  const perName = useMemo(() => {
    const counts = names.map(() => 0);
    for (const mask of model.cells.values()) names.forEach((_, i) => { if ((mask & (1 << i)) !== 0) counts[i] += 1; });
    return names.map((name, i) => ({ name, count: counts[i] }));
  }, [model, names]);

  const readout = useMemo(() => {
    if (!hover) return null;
    const row = rows[hover.row];
    const col = model.cols[hover.col];
    if (!row || !col) return null;
    const mask = model.cells.get(row.index * model.cols.length + hover.col) ?? 0;
    const present = names.filter((_, i) => (mask & (1 << i)) !== 0);
    return { row: row.entity, col, present };
  }, [hover, rows, model, names]);

  return (
    <section className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-controls">
          <label className="control">{t("Cross")}
            <select
              value={`${pair.from}>${pair.to}`}
              onChange={(event) => {
                const [from, to] = event.target.value.split(">");
                onPair({ from, to });
              }}
            >
              {pairs.map((entry) => (
                <option key={`${entry.from}>${entry.to}`} value={`${entry.from}>${entry.to}`}>
                  {entry.from} × {entry.to} · {fmt(entry.count)} · {Math.round(entry.density * 100)}%
                </option>
              ))}
            </select>
          </label>
          <input className="field find" placeholder={t("Filter rows")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="graph-legend">
          {names.map((name) => (
            <span key={name} className="legend-item"><i style={{ background: colors.get(name) }} />{name}</span>
          ))}
        </div>
      </div>

      <div className="matrix-scroll">
        <canvas
          ref={canvas}
          className="matrix-canvas"
          onMouseMove={(event) => setHover(at(event))}
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const spot = at(event);
            if (!spot) return;
            const row = rows[spot.row];
            if (row) onFocusEntity(row.entity.id);
          }}
        />
      </div>

      <p className="graph-stats">
        {t("{rows} of {rowsTotal} {from} by {cols} of {colsTotal} {to}. {pairs} of {possible} cells are filled: {breakdown}.", {
          rows: fmt(rows.length), rowsTotal: fmt(model.rowsTotal), from: pair.from,
          cols: fmt(model.cols.length), colsTotal: fmt(model.colsTotal), to: pair.to,
          pairs: fmt(model.pairs), possible: fmt(model.rows.length * model.cols.length),
          breakdown: perName.map((entry) => `${entry.name} ${fmt(entry.count)}`).join(", "),
        })}{" "}
        {readout ? (
          <>
            <strong>{displayTitle(readout.row)}</strong> × <strong>{displayTitle(readout.col)}</strong>:{" "}
            {readout.present.length > 0 ? readout.present.join(", ") : t("no relationship")}{" "}
            <button className="chip" onClick={() => onExplore(readout.row.id)}>{t("Explore neighbourhood")}</button>
          </>
        ) : (
          t("Hover a cell to read the pair; click a row to open the record.")
        )}
      </p>
    </section>
  );
}
