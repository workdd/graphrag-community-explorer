import { useMemo, useState } from "react";
import { depthOfLevel, levelsByDepth } from "../../core/hierarchy";
import { LevelTag, levelLabel } from "../level";
import { comparePartitions } from "../../core/metrics/compare";
import { SIZE_BUCKETS, communityQuality, levelQuality, sizeHistogram } from "../../core/metrics/quality";
import type { Dataset, Partition } from "../../core/model";
import { DEPTH_FILL } from "../graph/style";
import { downloadText, toCsv } from "../download";
import { fmt, pct } from "../format";
import { Rich, useT } from "../i18n";

interface Props {
  dataset: Dataset;
  partition: Partition;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type SortKey = "title" | "level" | "size" | "internal" | "boundary" | "share" | "density" | "conductance";

const columns: { key: SortKey; label: string; numeric: boolean; hint?: string }[] = [
  { key: "title", label: "Community", numeric: false },
  { key: "level", label: "Level", numeric: false },
  { key: "size", label: "Entities", numeric: true },
  { key: "internal", label: "Internal", numeric: true, hint: "Relationships with both ends inside" },
  { key: "boundary", label: "Boundary", numeric: true, hint: "Relationships with one end outside" },
  { key: "share", label: "Internal share", numeric: true, hint: "Internal over internal plus boundary" },
  { key: "density", label: "Density", numeric: true, hint: "Internal relationships over possible member pairs" },
  { key: "conductance", label: "Conductance", numeric: true, hint: "Boundary over the volume touching the community: lower is more self-contained" },
];

const fix = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "");

export function QualityView({ dataset, partition, selectedId, onSelect }: Props) {
  const { t } = useT();
  const quality = useMemo(() => communityQuality(dataset, partition), [dataset, partition]);
  const levels = useMemo(() => levelQuality(dataset, partition), [dataset, partition]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "conductance", dir: -1 });

  const value = (id: string, key: SortKey): number | string => {
    const c = partition.communities.get(id)!;
    const q = quality.get(id)!;
    switch (key) {
      case "title": return c.title.toLowerCase();
      case "level": return c.level;
      case "size": return q.size;
      case "internal": return q.internalEdges;
      case "boundary": return q.boundaryEdges;
      case "share": return q.internalRatio;
      case "density": return q.density;
      case "conductance": return q.conductance;
    }
  };
  const rows = useMemo(
    () => [...partition.communities.keys()].sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return cmp * sort.dir || partition.communities.get(a)!.title.localeCompare(partition.communities.get(b)!.title);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partition, quality, sort],
  );
  const header = (key: SortKey) => setSort((prev) => ({ key, dir: prev.key === key ? (prev.dir === 1 ? -1 : 1) : key === "title" || key === "level" ? 1 : -1 }));

  const histograms = useMemo(
    () => partition.levels.map((level) => ({ level, counts: sizeHistogram([...partition.communities.values()].filter((c) => c.level === level)) })),
    [partition],
  );
  const maxBucket = Math.max(1, ...histograms.flatMap((h) => h.counts));

  return (
    <div className="quality">
      <section>
        <h2>{t("Levels")}</h2>
        <p className="muted">{t("Modularity compares relationships inside communities against a random rewiring; above 0.3 usually means the grouping follows the graph. Coverage is the share of entities assigned at that level.")}</p>
        <table className="ctable compact">
          <thead>
            <tr><th>{t("Level")}</th><th className="num">{t("Communities")}</th><th className="num">{t("Covered")}</th><th className="num">{t("Coverage")}</th><th className="num">{t("Modularity")}</th><th className="num">{t("Median size")}</th><th className="num">{t("Largest")}</th></tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.level} className="static">
                <td><LevelTag partition={partition} level={l.level} /></td>
                <td className="num">{fmt(l.communities)}</td>
                <td className="num">{fmt(l.coveredEntities)}</td>
                <td className="num">{pct(l.coverage)}</td>
                <td className="num">{fix(l.modularity, 3)}</td>
                <td className="num">{fmt(l.medianSize)}</td>
                <td className="num">{fmt(l.largestSize)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>{t("Community sizes")}</h2>
        <div className="hist">
          {histograms.map((h) => (
            <div key={h.level} className="hist-row">
              <LevelTag partition={partition} level={h.level} />
              <svg viewBox={`0 0 ${SIZE_BUCKETS.length * 60} 70`} className="hist-svg" role="img" aria-label={t("Community sizes at level {level}", { level: depthOfLevel(partition, h.level) })}>
                {h.counts.map((count, i) => {
                  const height = (count / maxBucket) * 48;
                  return (
                    <g key={i} transform={`translate(${i * 60}, 0)`}>
                      <rect x={8} y={50 - height} width={44} height={height} fill={DEPTH_FILL[Math.min(depthOfLevel(partition, h.level), DEPTH_FILL.length - 1)]} stroke="#b9c6ae" />
                      {count > 0 && <text x={30} y={46 - height} textAnchor="middle" fontSize={11} fill="#1b2430">{count}</text>}
                      <text x={30} y={64} textAnchor="middle" fontSize={10} fill="#5f6b78">{SIZE_BUCKETS[i].label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ))}
        </div>
      </section>

      {dataset.partitions.length > 1 && <ComparePanel dataset={dataset} current={partition} />}

      <section>
        <div className="table-head">
          <h2>{t("Communities")}</h2>
          <button
            className="btn"
            title={t("Download all rows as CSV")}
            onClick={() => downloadText("community-quality.csv", toCsv([
              ["id", "title", "level", "entities", "internal", "boundary", "internal_share", "density", "conductance", "average_degree"],
              ...rows.map((id) => { const c = partition.communities.get(id)!; const q = quality.get(id)!; return [c.id, c.title, c.level, q.size, q.internalEdges, q.boundaryEdges, q.internalRatio.toFixed(4), q.density.toFixed(4), q.conductance.toFixed(4), q.averageDegree.toFixed(3)]; }),
            ]), "text/csv;charset=utf-8")}
          >CSV</button>
        </div>
        <table className="ctable">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.numeric ? "num" : undefined} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button className="sort-btn" title={c.hint && t(c.hint)} onClick={() => header(c.key)}>{t(c.label)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => {
              const c = partition.communities.get(id)!;
              const q = quality.get(id)!;
              return (
                <tr
                  key={id}
                  className={id === selectedId ? "selected" : undefined}
                  onClick={() => onSelect(id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }}
                  tabIndex={0}
                  aria-selected={id === selectedId}
                >
                  <td className="title" title={c.title}>{c.title}</td>
                  <td><LevelTag partition={partition} level={c.level} /></td>
                  <td className="num">{fmt(q.size)}</td>
                  <td className="num">{fmt(q.internalEdges)}</td>
                  <td className="num">{fmt(q.boundaryEdges)}</td>
                  <td className="num">{pct(q.internalRatio)}</td>
                  <td className="num">{fix(q.density)}</td>
                  <td className="num">{fix(q.conductance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ComparePanel({ dataset, current }: { dataset: Dataset; current: Partition }) {
  const { t } = useT();
  const other = dataset.partitions.find((p) => p.id !== current.id) ?? current;
  const [aId, setAId] = useState(current.id);
  const [bId, setBId] = useState(other.id);
  const a = dataset.partitions.find((p) => p.id === aId) ?? current;
  const b = dataset.partitions.find((p) => p.id === bId) ?? other;
  const [levelA, setLevelA] = useState<number | null>(null);
  const [levelB, setLevelB] = useState<number | null>(null);
  const la = levelA !== null && a.levels.includes(levelA) ? levelA : a.levels[a.levels.length - 1] ?? 0;
  const lb = levelB !== null && b.levels.includes(levelB) ? levelB : b.levels[b.levels.length - 1] ?? 0;
  const comparison = useMemo(() => comparePartitions(a, la, b, lb), [a, la, b, lb]);
  const title = (p: Partition, id: string) => p.communities.get(id)?.title ?? id;

  return (
    <section>
      <h2>{t("Two community sets side by side")}</h2>
      <p className="muted">{t("Each entity is assigned to its smallest community at the chosen level of each set. NMI and ARI are 1 when the two sets group the common entities the same way and near 0 when they are unrelated.")}</p>
      <div className="compare-controls">
        <label className="control">A
          <select value={a.id} onChange={(e) => setAId(e.target.value)}>{dataset.partitions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <select value={la} onChange={(e) => setLevelA(Number(e.target.value))}>{levelsByDepth(a).map((l) => <option key={l} value={l}>{levelLabel(a, l)}</option>)}</select>
        </label>
        <label className="control">B
          <select value={b.id} onChange={(e) => setBId(e.target.value)}>{dataset.partitions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <select value={lb} onChange={(e) => setLevelB(Number(e.target.value))}>{levelsByDepth(b).map((l) => <option key={l} value={l}>{levelLabel(b, l)}</option>)}</select>
        </label>
      </div>
      <p className="summary small">
        <Rich text="**{common}** entities are grouped by both. NMI **{nmi}**, ARI **{ari}**." vars={{ common: fmt(comparison.common), nmi: fix(comparison.nmi, 3), ari: fix(comparison.ari, 3) }} />
        {comparison.onlyInA > 0 && t(" {n} entities only in A.", { n: fmt(comparison.onlyInA) })}
        {comparison.onlyInB > 0 && t(" {n} only in B.", { n: fmt(comparison.onlyInB) })}
      </p>
      <table className="ctable compact">
        <thead><tr><th>A</th><th>B</th><th className="num">{t("Shared entities")}</th><th>{t("Share of A")}</th></tr></thead>
        <tbody>
          {comparison.crosstab.slice(0, 15).map((cell) => {
            const sizeA = a.communities.get(cell.a)?.entityIds.length ?? cell.count;
            return (
              <tr key={`${cell.a}|${cell.b}`} className="static">
                <td className="title">{title(a, cell.a)}</td>
                <td className="title">{title(b, cell.b)}</td>
                <td className="num">{fmt(cell.count)}</td>
                <td><span className="share"><span className="bar"><i style={{ width: pct(cell.count / Math.max(1, sizeA)) }} /></span><span className="num">{pct(cell.count / Math.max(1, sizeA))}</span></span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
