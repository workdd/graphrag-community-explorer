import { useMemo } from "react";
import type { EmbeddingIndex } from "../../core/loaders/embeddings";
import type { Dataset, Partition } from "../../core/model";
import { crossZoneLabels, describeSystem, labelWidth, type SystemNode, type Zone } from "../../core/search/systemMap";
import type { SearchMethod, SearchRun } from "../../core/search/types";
import { fill, useT } from "../i18n";

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  embeddings?: EmbeddingIndex;
  method: SearchMethod;
  run: SearchRun | null;
}

const ZONES: { id: Zone; label: string }[] = [
  { id: "retrieval", label: "Retrieval" },
  { id: "context", label: "Context window" },
  { id: "model", label: "Model call" },
  { id: "response", label: "Response" },
];

const BOX_W = 172;
const BOX_H = 52;
const GAP_Y = 12;
/** Widened at render time when a flow label needs more room than this. */
const MIN_GAP_X = 58;
const PAD = 14;
const HEAD = 22;
const LABEL_PX = 9;

/** SVG does not wrap, so a long note is cut rather than allowed to run over the next box. */
const clip = (text: string, max = 34): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

export function SystemMap({ dataset, partition, embeddings, method, run }: Props) {
  const { t } = useT();
  const map = useMemo(
    () => describeSystem({ dataset, partition, embeddings, method, run }),
    [dataset, partition, embeddings, method, run],
  );

  const zones = ZONES.filter((zone) => map.nodes.some((node) => node.zone === zone.id));
  const zoneOf = new Map(map.nodes.map((node) => [node.id, node.zone]));
  // A label between two columns is drawn in the gap, so the gap is as wide as the widest label.
  // Translating the map can change which label that is, so it is measured after translation.
  const gapX = Math.max(
    MIN_GAP_X,
    Math.ceil(crossZoneLabels(map).reduce((widest, label) => Math.max(widest, labelWidth(t(label), LABEL_PX)), 0)) + 20,
  );
  const columnX = new Map(zones.map((zone, i) => [zone.id, PAD + i * (BOX_W + gapX)]));
  const place = (node: SystemNode) => ({
    x: columnX.get(node.zone) ?? PAD,
    y: PAD + HEAD + node.row * (BOX_H + GAP_Y),
  });
  const positions = new Map(map.nodes.map((node) => [node.id, place(node)]));
  const rows = Math.max(...map.nodes.map((node) => node.row)) + 1;
  const width = PAD * 2 + zones.length * BOX_W + (zones.length - 1) * gapX;
  const height = PAD * 2 + HEAD + rows * (BOX_H + GAP_Y);

  return (
    <div className="system-map">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={t("How a question reaches an answer")}>
        <defs>
          <marker id="sm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#8c96a0" />
          </marker>
          <marker id="sm-arrow-out" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#a3423c" />
          </marker>
        </defs>

        {zones.map((zone) => {
          const x = columnX.get(zone.id)!;
          return (
            <g key={zone.id}>
              <rect x={x - 8} y={PAD + HEAD - 8} width={BOX_W + 16} height={height - PAD * 2 - HEAD + 12}
                    rx="8" fill={zone.id === "model" ? "#fbf3f2" : "#f4f6f3"} stroke="#e2e7e0" />
              <text x={x} y={PAD + 10} className="zone">{t(zone.label)}</text>
            </g>
          );
        })}

        {map.flows.map((flow, i) => {
          const from = positions.get(flow.from);
          const to = positions.get(flow.to);
          if (!from || !to) return null;
          const forward = to.x >= from.x;
          const sameColumn = to.x === from.x;
          const sx = sameColumn ? from.x + BOX_W / 2 : forward ? from.x + BOX_W : from.x;
          const sy = sameColumn ? from.y + BOX_H : from.y + BOX_H / 2;
          const tx = sameColumn ? to.x + BOX_W / 2 : forward ? to.x : to.x + BOX_W;
          const ty = sameColumn ? to.y : to.y + BOX_H / 2;
          const bend = sameColumn ? 0 : (forward ? 1 : -1) * Math.max(24, Math.abs(tx - sx) / 2);
          const d = sameColumn
            ? `M${sx},${sy} L${tx},${ty}`
            : `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`;
          return (
            <g key={i} className={flow.leaves ? "flow out" : "flow"}>
              <path d={d} markerEnd={`url(#${flow.leaves ? "sm-arrow-out" : "sm-arrow"})`} />
              {flow.label ? (() => {
                const text = t(flow.label);
                const mx = (sx + tx) / 2;
                const my = (sy + ty) / 2 - 5;
                // A label in the gap sits on the map's own background, so it is given a plate to
                // keep the line it names from running through the letters. One inside a zone box
                // would need that zone's colour, and there the line is short enough to read past.
                const inGap = zoneOf.get(flow.from) !== zoneOf.get(flow.to);
                const plate = labelWidth(text, LABEL_PX) + 8;
                return (
                  <>
                    {inGap ? <rect className="flow-plate" x={mx - plate / 2} y={my - 9} width={plate} height={12} rx="2" /> : null}
                    <text x={mx} y={my} className="flow-label">{text}</text>
                  </>
                );
              })() : null}
            </g>
          );
        })}

        {map.nodes.map((node) => {
          const at = positions.get(node.id)!;
          return (
            <g key={node.id} className={`node ${node.zone}${node.call ? " call" : ""}`}>
              <rect x={at.x} y={at.y} width={BOX_W} height={BOX_H} rx="6" />
              <text x={at.x + 10} y={at.y + 16} className="name">{t(node.label)}</text>
              <text x={at.x + 10} y={at.y + 31} className="value">{node.value ?? "—"}</text>
              {node.note ? (
                <text x={at.x + 10} y={at.y + 45} className="note">{clip(fill(t(node.note), node.noteVars))}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="muted legend-out">
        <i /> {t("Bordered boxes are calls to the model. Red arrows carry text out of this tab; everything else stays here.")}
      </p>
    </div>
  );
}
