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

/** Node and edge keys to keep lit when one node is selected: itself, its links, and their far ends. */
export function neighbourhoodOf(graph: EvidenceGraph, nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    edges.add(edge.id);
    nodes.add(edge.source);
    nodes.add(edge.target);
  }
  return { nodes, edges };
}

/** The drawing key for a context item, so a click in the answer or the table lights the same node. */
export function nodeKeyFor(graph: EvidenceGraph, kind: string, shortId: string): string | null {
  if (kind === "entities") {
    return graph.nodes.find((node) => node.shortId === shortId)?.id ?? null;
  }
  if (kind === "relationships") {
    const edge = graph.edges.find((e) => e.shortId === shortId);
    return edge?.source ?? null;
  }
  return null;
}

/** The edge key for a cited relationship, so citing a link lights the link rather than one end. */
export const edgeKeyFor = (graph: EvidenceGraph, shortId: string): string | null =>
  graph.edges.find((edge) => edge.shortId === shortId)?.id ?? null;
