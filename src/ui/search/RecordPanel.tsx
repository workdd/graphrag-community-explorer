import { useMemo } from "react";
import { evidenceForEntity, snippet } from "../../core/evidence";
import type { Selection } from "../../core/search/highlight";
import type { ContextItem, SearchContext } from "../../core/search/types";
import type { Dataset } from "../../core/model";
import { useT } from "../i18n";
import { readableLink, readableTitle } from "./label";

interface Props {
  dataset: Dataset;
  context: SearchContext;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** Secondary way out to the other views. Null when the run came from another index. */
  onOpenEntity: ((id: string) => void) | null;
  onOpenCommunity: ((id: string) => void) | null;
}

const KIND_LABEL: Record<Selection["kind"], string> = {
  entities: "Entity",
  relationships: "Relationship",
  reports: "Report",
  sources: "Source",
  claims: "Claim",
};

const raw = (item: ContextItem, key: string): string => {
  const value = item.raw?.[key];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
};

export function RecordPanel({ dataset, context, selection, onSelect, onOpenEntity, onOpenCommunity }: Props) {
  const { t } = useT();
  const item = selection ? context[selection.kind].find((entry) => entry.shortId === selection.shortId) ?? null : null;

  // Links this run carried that touch the selected entity, so the panel answers "what is it wired to"
  // without sending the reader to another screen.
  const links = useMemo(() => {
    if (!selection || selection.kind !== "entities" || !item) return [];
    return context.relationships.filter((r) => raw(r, "source") === item.title || raw(r, "target") === item.title);
  }, [selection, item, context.relationships]);

  const chunks = useMemo(() => {
    if (!selection || selection.kind !== "entities" || !item?.id) return [];
    return evidenceForEntity(dataset, item.id).slice(0, 3);
  }, [selection, item, dataset]);

  if (!selection || !item) {
    return (
      <div className="record-pane empty">
        <p className="muted">{t("Pick a citation, a node or a row to read the record here.")}</p>
      </div>
    );
  }

  const ends = selection.kind === "relationships" ? [raw(item, "source"), raw(item, "target")] : [];
  const endSelection = (title: string): Selection | null => {
    const entity = context.entities.find((e) => e.title === title);
    return entity ? { kind: "entities", shortId: entity.shortId } : null;
  };

  return (
    <div className="record-pane">
      <div className="record-head">
        <span className="tag">{t(KIND_LABEL[selection.kind])} {item.shortId}</span>
        <button className="btn small" onClick={() => onSelect(null)}>{t("Close")}</button>
      </div>
      <h3>{selection.kind === "relationships" ? readableLink(item.title) : readableTitle(item.title)}</h3>
      <dl className="facts">
        {raw(item, "type") ? <><dt>{t("Type")}</dt><dd>{raw(item, "type")}</dd></> : null}
        {raw(item, "degree") ? <><dt>{t("Links in the index")}</dt><dd>{raw(item, "degree")}</dd></> : null}
        {raw(item, "level") ? <><dt>{t("Level")}</dt><dd>{raw(item, "level")}</dd></> : null}
        {item.score !== undefined ? <><dt>{t("Score")}</dt><dd>{item.score.toFixed(3)}</dd></> : null}
        {item.tokens !== undefined ? <><dt>{t("Tokens")}</dt><dd>{item.tokens}</dd></> : null}
      </dl>

      <h4>{t("Text sent to the model")}</h4>
      <p className="record-text">{item.text}</p>

      {ends.length === 2 ? (
        <>
          <h4>{t("Ends")}</h4>
          <ul className="chips">
            {ends.map((title) => {
              const target = endSelection(title);
              return (
                <li key={title}>
                  <button className="chip" disabled={!target} onClick={() => target && onSelect(target)}>{readableTitle(title)}</button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {links.length > 0 ? (
        <>
          <h4>{t("Links this run carried ({count})", { count: links.length })}</h4>
          <ul className="record-links">
            {links.slice(0, 20).map((link) => (
              <li key={link.shortId}>
                <button className="linklike" onClick={() => onSelect({ kind: "relationships", shortId: link.shortId })}>
                  {readableLink(link.title)}
                </button>
                <span className="muted"> {raw(link, "type")}</span>
              </li>
            ))}
            {links.length > 20 ? <li className="muted">{t("and {count} more", { count: links.length - 20 })}</li> : null}
          </ul>
        </>
      ) : null}

      {chunks.length > 0 ? (
        <>
          <h4>{t("Source text")}</h4>
          {chunks.map((evidence) => (
            <p key={evidence.unit.id} className="record-chunk">
              {snippet(evidence.unit.text, 300)}
              <span className="muted"> {evidence.documentTitles.join(", ")}</span>
            </p>
          ))}
        </>
      ) : null}

      {selection.kind === "entities" && item.id && onOpenEntity ? (
        <button className="btn" onClick={() => onOpenEntity(item.id!)}>{t("Open the neighbourhood graph")}</button>
      ) : null}
      {selection.kind === "reports" && item.id && onOpenCommunity ? (
        <button className="btn" onClick={() => onOpenCommunity(item.id!)}>{t("Open this community")}</button>
      ) : null}
    </div>
  );
}
