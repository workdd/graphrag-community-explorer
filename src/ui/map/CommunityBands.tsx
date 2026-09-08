import { useMemo, useState } from "react";
import { bandLayout } from "../../core/graph/bands";
import type { Dataset, Partition } from "../../core/model";
import { DEPTH_FILL } from "../graph/style";
import { fmt } from "../format";
import { useT } from "../i18n";

interface Props {
  dataset: Dataset;
  partition: Partition;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenGraph: (id: string) => void;
}

const BAND_HEIGHT = 104;
/** One colour per depth, darkening as the levels get finer. */
const STROKE = ["#8a4a6a", "#6a5a8a", "#3d6b45", "#8a6a3a", "#4a6a8a", "#6a4a4a"];

/** Every community at once: a band per level, a circle per community, a curve to its parent. */
export function CommunityBands({ dataset, partition, selectedId, onSelect, onOpenGraph }: Props) {
  const { t } = useT();
  const model = useMemo(() => bandLayout(partition, { bandHeight: BAND_HEIGHT }), [partition]);
  const [showLoose, setShowLoose] = useState(true);
  // Records that no community claims. Leaving them out would make the picture look complete.
  const loose = useMemo(() => {
    const covered = new Set<string>();
    for (const community of partition.communities.values()) for (const id of community.entityIds) covered.add(id);
    return [...dataset.entities.values()].filter((entity) => !covered.has(entity.id));
  }, [dataset, partition]);
  const looseRows = Math.ceil(Math.min(loose.length, 600) / 60);
  const looseHeight = showLoose && loose.length > 0 ? 34 + looseRows * 11 : 0;
  const colour = (depth: number) => STROKE[Math.min(depth, STROKE.length - 1)];

  return (
    <section className="graph-view">
      <p className="graph-stats">
        {t("{communities} communities on {levels} levels. A band is a level, a circle is a community sized by how many entities it holds, and a curve joins a community to its parent.", {
          communities: fmt(partition.communities.size),
          levels: fmt(model.bands.length),
        })}{" "}
        {t("Click a circle to read it; double-click to open its internal graph.")}
      </p>
      <div className="bands-controls">
        <label className="control">
          <input type="checkbox" checked={showLoose} onChange={(event) => setShowLoose(event.target.checked)} />{" "}
          {t("Show entities in no community")}
        </label>
        <span className="muted">{t("{n} entities are in no community", { n: fmt(loose.length) })}</span>
      </div>
      <div className="bands-scroll">
        <svg className="bands" viewBox={`0 0 ${model.width} ${model.height + looseHeight}`} width={model.width} height={model.height + looseHeight} role="img">
          {model.bands.map((band, index) => (
            <g key={band.level}>
              <rect x={0} y={band.y} width={model.width} height={band.height} fill={index % 2 === 0 ? "#fbfaf8" : "#f2f0ec"} />
              <text x={10} y={band.y + 16} fontSize={11} fill="#8a837a" className="mono">
                {t("L{depth} · {communities} communities · {entities} entities", {
                  depth: band.depth,
                  communities: fmt(band.communities),
                  entities: fmt(band.entities),
                })}
              </text>
            </g>
          ))}
          {model.links.map((link) => {
            const mid = (link.from.y + link.to.y) / 2;
            return (
              <path
                key={link.id}
                d={`M${link.from.x},${link.from.y} C${link.from.x},${mid} ${link.to.x},${mid} ${link.to.x},${link.to.y}`}
                fill="none"
                stroke="#5b554e"
                strokeWidth={1.2}
                strokeOpacity={0.45}
              />
            );
          })}
          {model.circles.map((circle) => (
            <g
              key={circle.id}
              className={`band-node${circle.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(circle.id)}
              onDoubleClick={() => onOpenGraph(circle.id)}
            >
              <title>{`${circle.title} · ${fmt(circle.size)}`}</title>
              <circle
                cx={circle.x}
                cy={circle.y}
                r={circle.r}
                fill={DEPTH_FILL[Math.min(circle.depth, DEPTH_FILL.length - 1)]}
                fillOpacity={circle.id === selectedId ? 0.65 : 0.34}
                stroke={colour(circle.depth)}
                strokeWidth={circle.id === selectedId ? 2.6 : 1.6}
              />
              <text x={circle.x} y={circle.y + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={600}>
                {fmt(circle.size)}
              </text>
              <text x={circle.x} y={circle.y + circle.r + 12} textAnchor="middle" fontSize={9.5} fill="#4e4d49">
                {circle.title.length > 18 ? `${circle.title.slice(0, 17)}…` : circle.title}
              </text>
            </g>
          ))}
          {showLoose && loose.length > 0 && (
            <g className="loose">
              <rect x={0} y={model.height} width={model.width} height={looseHeight} fill="#f6f5f3" />
              <text x={10} y={model.height + 16} fontSize={11} fill="#8a837a" className="mono">
                {t("{n} entities are in no community", { n: fmt(loose.length) })}
              </text>
              {loose.slice(0, 600).map((entity, index) => (
                <circle
                  key={entity.id}
                  cx={14 + (index % 60) * ((model.width - 28) / 60)}
                  cy={model.height + 30 + Math.floor(index / 60) * 11}
                  r={3.2}
                  fill="#b9c0c8"
                >
                  <title>{`${entity.type} · ${entity.title}`}</title>
                </circle>
              ))}
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
