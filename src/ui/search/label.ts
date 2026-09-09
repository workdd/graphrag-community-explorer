// Titles as the runner wrote them carry the type prefix and the source id, because that is what the
// model was shown. A reader does not need either to recognize the record, so headings and node
// labels drop them. The exact string the model saw stays visible in the record panel.

const ID_SUFFIX = /\s*\[[A-Za-z]+:[^\]]*\]\s*$/;
const TYPE_PREFIX = /^[A-Za-z][A-Za-z0-9_]*\s·\s/;

export function readableTitle(title: string): string {
  const withoutId = title.replace(ID_SUFFIX, "");
  const withoutType = withoutId.replace(TYPE_PREFIX, "");
  return withoutType.trim() || withoutId.trim() || title;
}

/** Both ends of a relationship title, each cleaned. Falls back to the whole string when it is not a pair. */
export function readableLink(title: string): string {
  const parts = title.split(" → ");
  if (parts.length !== 2) return readableTitle(title);
  return `${readableTitle(parts[0])} → ${readableTitle(parts[1])}`;
}
