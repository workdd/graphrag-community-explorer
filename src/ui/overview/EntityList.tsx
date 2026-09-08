import { useMemo, useState } from "react";
import { displayTitle } from "../../core/graph/palette";
import type { Dataset } from "../../core/model";
import { fmt } from "../format";
import { useT } from "../i18n";

interface Props {
  dataset: Dataset;
  focusId: string | null;
  onFocus: (entityId: string) => void;
}

const LIMIT = 200;

/** Entity-first navigation for indexes without communities: search, then open a neighbourhood from the inspector. */
export function EntityList({ dataset, focusId, onFocus }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = [...dataset.entities.values()];
    const hits = needle === "" ? all : all.filter((e) => e.title.toLowerCase().includes(needle) || e.type.toLowerCase().includes(needle));
    return { total: hits.length, shown: hits.sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)).slice(0, LIMIT) };
  }, [dataset, query]);

  return (
    <div className="tree">
      <input className="field" placeholder={t("Find an entity")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("Find an entity")} />
      <div className="tree-meta">
        {t("No community set: {shown} of {total} entities, most connected first.", { shown: fmt(rows.shown.length), total: fmt(rows.total) })}
      </div>
      <ul className="tree-root">
        {rows.shown.map((e) => (
          <li key={e.id}>
            <div className={`tree-row${e.id === focusId ? " selected" : ""}`}>
              <button className="tree-label" onClick={() => onFocus(e.id)} title={e.title}>
                <span className="type-tag">{e.type}</span>
                <span className="tree-title">{displayTitle(e)}</span>
                <span className="tree-size num">{fmt(e.degree)}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
