import { useMemo, useState } from "react";
import { depthOfLevel } from "../../core/hierarchy";
import type { CommunityMetrics } from "../../core/metrics/summary";
import type { Community, Partition } from "../../core/model";
import { downloadText, toCsv } from "../download";
import { fmt, pct } from "../format";
import { useT } from "../i18n";

interface Props {
  partition: Partition;
  metrics: Map<string, CommunityMetrics>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type SortKey = "title" | "level" | "size" | "internal" | "boundary" | "share" | "rank";

const columns: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "title", label: "Community", numeric: false },
  { key: "level", label: "Level", numeric: false },
  { key: "size", label: "Entities", numeric: true },
  { key: "internal", label: "Internal", numeric: true },
  { key: "boundary", label: "Boundary", numeric: true },
  { key: "share", label: "Internal share", numeric: false },
  { key: "rank", label: "Rank", numeric: true },
];

export function CommunityTable({ partition, metrics, selectedId, onSelect }: Props) {
  const { t } = useT();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "size", dir: -1 });
  const [query, setQuery] = useState("");
  const hasRank = [...partition.communities.values()].some((c) => c.report?.rank !== undefined);
  const shown = columns.filter((c) => c.key !== "rank" || hasRank);

  const value = (c: Community, key: SortKey): number | string => {
    const m = metrics.get(c.id);
    switch (key) {
      case "title": return c.title.toLowerCase();
      case "level": return c.level;
      case "size": return c.entityIds.length;
      case "internal": return m?.internalEdges ?? 0;
      case "boundary": return m?.boundaryEdges ?? 0;
      case "share": return m?.internalRatio ?? 0;
      case "rank": return c.report?.rank ?? -1;
    }
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...partition.communities.values()]
      .filter((c) => needle === "" || c.title.toLowerCase().includes(needle))
      .sort((a, b) => {
        const va = value(a, sort.key);
        const vb = value(b, sort.key);
        const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
        return cmp * sort.dir || a.title.localeCompare(b.title);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partition, metrics, sort, query]);

  const header = (key: SortKey) =>
    setSort((prev) => ({ key, dir: prev.key === key ? (prev.dir === 1 ? -1 : 1) : key === "title" || key === "level" ? 1 : -1 }));

  return (
    <>
      <div className="table-head">
        <h2>{t("Communities")}</h2>
        <span className="muted">
          {t("{shown} of {total}. Internal counts relationships with both ends inside; boundary counts those with one end outside.", { shown: fmt(rows.length), total: fmt(partition.communities.size) })}
        </span>
        <input className="field" placeholder={t("Filter by title")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("Filter communities")} />
        <button
          className="btn"
          title={t("Download the rows below as CSV")}
          onClick={() => downloadText("communities.csv", toCsv([
            ["id", "title", "level", "parent", "entities", "internal", "boundary", "internal_share", "rank"],
            ...rows.map((c) => { const m = metrics.get(c.id); return [c.id, c.title, c.level, c.parentId ?? "", c.entityIds.length, m?.internalEdges ?? 0, m?.boundaryEdges ?? 0, (m?.internalRatio ?? 0).toFixed(4), c.report?.rank ?? ""]; }),
          ]), "text/csv;charset=utf-8")}
        >CSV</button>
      </div>
      <table className="ctable">
        <thead>
          <tr>
            {shown.map((c) => (
              <th
                key={c.key}
                className={c.numeric ? "num" : undefined}
                onClick={() => header(c.key)}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              >
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const m = metrics.get(c.id);
            return (
              <tr key={c.id} className={c.id === selectedId ? "selected" : undefined} onClick={() => onSelect(c.id)}>
                <td className="title" title={c.title}>{c.title}</td>
                <td><span className="level-tag" data-depth={Math.min(depthOfLevel(partition, c.level), 4)}>L{c.level}</span></td>
                <td className="num">{fmt(c.entityIds.length)}</td>
                <td className="num">{fmt(m?.internalEdges ?? 0)}</td>
                <td className="num">{fmt(m?.boundaryEdges ?? 0)}</td>
                <td>
                  <span className="share">
                    <span className="bar"><i style={{ width: pct(m?.internalRatio ?? 0) }} /></span>
                    <span className="num">{pct(m?.internalRatio ?? 0)}</span>
                  </span>
                </td>
                {hasRank && <td className="num">{c.report?.rank ?? ""}</td>}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td className="empty" colSpan={shown.length}>{t('No community title contains "{query}".', { query })}</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
