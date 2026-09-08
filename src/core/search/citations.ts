// Answers cite context items as [Data: Entities (3, 7); Reports (2, +more)]. The numbers are the
// shortIds handed to the model while the context was assembled, so they map back exactly.
import type { ContextKind } from "./types";

export interface Citation {
  /** null when the answer named a group we do not know; the text is then left alone. */
  kind: ContextKind | null;
  label: string;
  ids: string[];
  /** The model was told more items existed than it listed. */
  more: boolean;
}

export interface CitationBlock {
  start: number;
  end: number;
  text: string;
  citations: Citation[];
}

export type Segment = { kind: "text"; text: string } | { kind: "citation"; block: CitationBlock };

const KINDS: Record<string, ContextKind> = {
  entity: "entities",
  entities: "entities",
  relationship: "relationships",
  relationships: "relationships",
  report: "reports",
  reports: "reports",
  source: "sources",
  sources: "sources",
  "text unit": "sources",
  "text units": "sources",
  claim: "claims",
  claims: "claims",
};

const BLOCK = /\[(?:Data:)?([^\]]*)\]/gi;
const GROUP = /([A-Za-z][A-Za-z ]*?)\s*\(([^)]*)\)/g;

/** Every [Data: …] block in order, with its groups resolved. */
export function parseCitations(text: string): CitationBlock[] {
  const blocks: CitationBlock[] = [];
  BLOCK.lastIndex = 0;
  for (let m = BLOCK.exec(text); m !== null; m = BLOCK.exec(text)) {
    const citations: Citation[] = [];
    GROUP.lastIndex = 0;
    for (let g = GROUP.exec(m[1]); g !== null; g = GROUP.exec(m[1])) {
      const label = g[1].trim();
      const parts = g[2].split(",").map((p) => p.trim()).filter((p) => p !== "");
      const more = parts.some((p) => /^\+/.test(p));
      const ids = parts.filter((p) => !/^\+/.test(p));
      const kind = KINDS[label.toLowerCase()] ?? null;
      // Same kind twice in one block is additive. Overwriting here is the bug in the app we studied.
      const existing = citations.find((c) => c.kind !== null && c.kind === kind);
      if (existing) {
        for (const id of ids) if (!existing.ids.includes(id)) existing.ids.push(id);
        existing.more = existing.more || more;
      } else {
        citations.push({ kind, label, ids, more });
      }
    }
    // Models drop the "Data:" prefix often enough to matter. A bracket without it counts only when
    // every group inside names a kind we know, so ordinary bracketed prose is left alone.
    const labelled = /^\[Data:/i.test(m[0]);
    const known = citations.length > 0 && citations.every((c) => c.kind !== null);
    if (!labelled && !known) continue;
    blocks.push({ start: m.index, end: m.index + m[0].length, text: m[0], citations });
  }
  return blocks;
}

/** The answer split into plain runs and citation blocks, so the view can render chips. */
export function splitByCitations(text: string): Segment[] {
  const blocks = parseCitations(text);
  if (blocks.length === 0) return text === "" ? [] : [{ kind: "text", text }];
  const out: Segment[] = [];
  let at = 0;
  for (const block of blocks) {
    if (block.start > at) out.push({ kind: "text", text: text.slice(at, block.start) });
    out.push({ kind: "citation", block });
    at = block.end;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}
