// What the answer actually leaned on, as opposed to what merely reached the prompt. The two are not
// the same and the difference is the point: a record that was retrieved and never cited says the
// retrieval was wide, while a citation says the model used it.
import { parseCitations } from "./citations";
import type { ContextKind, SearchContext } from "./types";

export type CitedShortIds = Record<ContextKind, Set<string>>;

const empty = (): CitedShortIds => ({
  entities: new Set(),
  relationships: new Set(),
  reports: new Set(),
  sources: new Set(),
  claims: new Set(),
});

/** Numbers the answer cited, per kind. Unknown kinds and numbers outside the context are kept out. */
export function citedShortIds(response: string, context: SearchContext): CitedShortIds {
  const out = empty();
  const present: Partial<Record<ContextKind, Set<string>>> = {};
  for (const kind of Object.keys(out) as ContextKind[]) {
    present[kind] = new Set(context[kind].map((item) => item.shortId));
  }
  for (const block of parseCitations(response)) {
    for (const citation of block.citations) {
      if (citation.kind === null) continue;
      for (const shortId of citation.ids) {
        if (present[citation.kind]?.has(shortId)) out[citation.kind].add(shortId);
      }
    }
  }
  return out;
}

export type Emphasis = "cited" | "retrieved" | "outside";

export interface Selection {
  kind: ContextKind;
  shortId: string;
}

export const sameSelection = (a: Selection | null, b: Selection | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.shortId === b.shortId);

export interface Counts {
  cited: number;
  retrieved: number;
}

/** How much of what was retrieved the answer actually used, for the caption above the graph. */
export function countUsage(context: SearchContext, cited: CitedShortIds): Counts {
  let retrieved = 0;
  let used = 0;
  for (const kind of Object.keys(cited) as ContextKind[]) {
    retrieved += context[kind].length;
    used += cited[kind].size;
  }
  return { cited: used, retrieved };
}
