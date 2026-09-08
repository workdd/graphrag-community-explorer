import { useMemo, useState } from "react";
import { displayTitle } from "../../core/graph/palette";
import type { Dataset } from "../../core/model";
import { fmt } from "../format";
import { useT } from "../i18n";

interface Props {
  dataset: Dataset;
  onExplore: (entityId: string) => void;
}

/**
 * One record is the way into a graph this size: the whole picture answers nothing, but the
 * neighbourhood of the thing you asked about does. So the search sits in the top bar, always there.
 */
export function EntityFinder({ dataset, onExplore }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out = [];
    for (const entity of dataset.entities.values()) {
      if (entity.title.toLowerCase().includes(needle)) out.push(entity);
      if (out.length > 200) break;
    }
    return out.sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)).slice(0, 12);
  }, [dataset, query]);

  return (
    <div className="finder">
      <input
        className="field"
        placeholder={t("Find a record")}
        aria-label={t("Open the neighbourhood of one record")}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && hits[0]) { onExplore(hits[0].id); setOpen(false); }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && hits.length > 0 && (
        <ul className="finder-hits">
          {hits.map((entity) => (
            <li key={entity.id}>
              <button onMouseDown={() => { onExplore(entity.id); setOpen(false); }}>
                <span className="type-tag">{entity.type}</span>
                <span className="value-title">{displayTitle(entity)}</span>
                <span className="num">{fmt(entity.degree)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
