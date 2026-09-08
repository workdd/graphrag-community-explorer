import { splitByCitations, type Citation } from "../../core/search/citations";
import type { SearchContext } from "../../core/search/types";
import { useT } from "../i18n";

/** Models write **bold** even when asked for plain text, so the markers are rendered rather than shown. */
function Marked({ text }: { text: string }) {
  // Heading markers at the start of a line are dropped; the line is emphasized instead.
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

interface Props {
  text: string;
  context: SearchContext;
  /** Called with the record a citation names, when the loaded dataset holds it. */
  onOpen: (kind: keyof SearchContext, id: string) => void;
}

/** One number in a citation. It only becomes a link when it names something we can open. */
function Chip({ citation, context, onOpen }: { citation: Citation } & Omit<Props, "text">) {
  const { t } = useT();
  if (citation.kind === null) return <span className="cite">{citation.label}</span>;
  const items = context[citation.kind];
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
        if (!item.id) {
          return (
            <span key={shortId} className="dead" title={item.title}>
              {shortId}
            </span>
          );
        }
        return (
          <button key={shortId} type="button" title={item.title} onClick={() => onOpen(citation.kind!, item.id!)}>
            {shortId}
          </button>
        );
      })}
      {citation.more ? <span className="dead">+</span> : null}
    </span>
  );
}

export function Answer({ text, context, onOpen }: Props) {
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
                <Chip key={j} citation={citation} context={context} onOpen={onOpen} />
              ))}
            </span>
          ),
        )}
      </p>
    </div>
  );
}
