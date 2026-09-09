import { splitByCitations, type Citation } from "../../core/search/citations";
import { sameSelection, type Selection } from "../../core/search/highlight";
import type { SearchContext } from "../../core/search/types";
import { useT } from "../i18n";

interface Props {
  text: string;
  context: SearchContext;
  selection: Selection | null;
  /** Selecting reads the record beside the answer. Nothing here navigates away from the tab. */
  onSelect: (selection: Selection | null) => void;
}

/** Models write **bold** even when asked for plain text, so the markers are rendered rather than shown. */
function Marked({ text }: { text: string }) {
  const parts = text.replace(/^#{1,6}\s+(.*)$/gm, "**$1**").split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <b key={i}>{part.slice(2, -2)}</b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Chip({ citation, context, selection, onSelect }: { citation: Citation } & Omit<Props, "text">) {
  const { t } = useT();
  if (citation.kind === null) return <span className="cite">{citation.label}</span>;
  const kind = citation.kind;
  const items = context[kind];
  return (
    <span className="cite">
      {citation.label}
      {citation.ids.map((shortId) => {
        const item = items.find((entry) => entry.shortId === shortId);
        if (!item) {
          return (
            <span key={shortId} className="dead" title={t("The answer cited a number that is not in the context.")}>
              {shortId}
            </span>
          );
        }
        const picked = sameSelection(selection, { kind, shortId });
        return (
          <button
            key={shortId}
            type="button"
            className={picked ? "picked" : ""}
            title={item.title}
            onClick={() => onSelect(picked ? null : { kind, shortId })}
          >
            {shortId}
          </button>
        );
      })}
      {citation.more ? <span className="dead">+</span> : null}
    </span>
  );
}

export function Answer({ text, context, selection, onSelect }: Props) {
  const parts = splitByCitations(text);
  return (
    <div className="answer">
      <p>
        {parts.map((part, i) =>
          part.kind === "text" ? (
            <Marked key={i} text={part.text} />
          ) : (
            <span key={i}>
              {part.block.citations.map((citation, j) => (
                <Chip key={j} citation={citation} context={context} selection={selection} onSelect={onSelect} />
              ))}
            </span>
          ),
        )}
      </p>
    </div>
  );
}
