import { membershipIndex, primaryCommunity } from "../hierarchy";
import type { Dataset, Entity, Partition, Relationship } from "../model";
import type { Subgraph, SubgraphNode } from "./subgraph";

export interface NeighborhoodOptions {
  hops: number;
  /** Entities kept, seed first, then by hop and degree. */
  maxNodes: number;
  relationshipTypes?: Set<string>;
}

/** Everything within `hops` relationships of one entity, regardless of community. */
export function neighborhoodSubgraph(dataset: Dataset, partition: Partition, seedId: string, options: NeighborhoodOptions): Subgraph {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const r of dataset.relationships) {
    if (options.relationshipTypes && !options.relationshipTypes.has(r.type)) continue;
    link(r.sourceId, r.targetId);
    link(r.targetId, r.sourceId);
  }

  const hopOf = new Map<string, number>([[seedId, 0]]);
  let frontier = [seedId];
  for (let hop = 1; hop <= options.hops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of adjacency.get(id) ?? []) {
        if (!hopOf.has(other)) {
          hopOf.set(other, hop);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  const reachable = [...hopOf.keys()]
    .map((id) => dataset.entities.get(id))
    .filter((e): e is Entity => e !== undefined)
    .sort((a, b) => hopOf.get(a.id)! - hopOf.get(b.id)! || b.degree - a.degree || a.title.localeCompare(b.title));
  const shown = reachable.slice(0, options.maxNodes);
  const shownIds = new Set(shown.map((e) => e.id));

  const typeCounts = new Map<string, number>();
  const edges: Relationship[] = [];
  for (const r of dataset.relationships) {
    const inS = shownIds.has(r.sourceId);
    const inT = shownIds.has(r.targetId);
    if (!inS && !inT) continue;
    typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
    if (inS && inT && (!options.relationshipTypes || options.relationshipTypes.has(r.type))) edges.push(r);
  }

  const index = membershipIndex(partition);
  const nodes: SubgraphNode[] = shown.map((entity) => ({ entity, ghost: false, community: primaryCommunity(index, entity.id) }));
  return {
    nodes,
    edges: edges.map((relationship) => ({ relationship, boundary: false })),
    stats: { members: reachable.length, shownMembers: shown.length, internalEdges: edges.length, boundaryEdges: 0, ghostNodes: 0, hiddenBoundaryEdges: 0 },
    typeCounts,
  };
}

/** Distinct primary communities of the nodes, largest first, so the graph can draw them as containers. */
export function communitiesOf(nodes: SubgraphNode[]): string[] {
  const seen = new Map<string, number>();
  for (const node of nodes) if (node.community) seen.set(node.community.id, node.community.size);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
