// The evidence a run used, as a graph. The table says what went into the prompt and how it scored;
// the graph says how those records sit together, which is the thing a table cannot show.
import type { SearchContext } from "./types";

export interface EvidenceNode {
  /** Stable key for the drawing, not a record id. */
  id: string;
  label: string;
  /** "seed" was ranked against the question; "outside" only appears as the far end of a link. */
  kind: "seed" | "outside";
  shortId?: string;
  recordId?: string;
  score?: number;
}

export interface EvidenceEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  shortId: string;
  recordId?: string;
}

export interface EvidenceGraph {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  /** Why the graph is empty, when it is. */
  note: "none" | "reports-only" | "no-links" | null;
}

const key = (title: string) => `n:${title}`;
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Nodes are the entities the run ranked; edges are the relationships it carried. A link whose far
 * end was not itself selected still gets a node, marked as outside, because the model saw that link
 * and dropping it would make the picture claim the neighbour does not exist.
 */
export function buildEvidenceGraph(context: SearchContext): EvidenceGraph {
  const nodes = new Map<string, EvidenceNode>();
  for (const entity of context.entities) {
    nodes.set(key(entity.title), {
      id: key(entity.title),
      label: entity.title,
      kind: "seed",
      shortId: entity.shortId,
      recordId: entity.id,
      score: entity.score,
    });
  }

  const edges: EvidenceEdge[] = [];
  for (const relationship of context.relationships) {
    const raw = relationship.raw ?? {};
    const source = text(raw.source);
    const target = text(raw.target);
    if (source === "" || target === "" || source === target) continue;
    for (const title of [source, target]) {
      if (!nodes.has(key(title))) {
        nodes.set(key(title), { id: key(title), label: title, kind: "outside" });
      }
    }
    edges.push({
      id: `e:${relationship.shortId}`,
      source: key(source),
      target: key(target),
      label: text(raw.type) || relationship.title,
      shortId: relationship.shortId,
      recordId: relationship.id,
    });
  }

  const list = [...nodes.values()];
  let note: EvidenceGraph["note"] = null;
  if (list.length === 0) note = context.reports.length > 0 ? "reports-only" : "none";
  else if (edges.length === 0) note = "no-links";
  return { nodes: list, edges, note };
}
