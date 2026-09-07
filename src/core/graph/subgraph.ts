import { membershipIndex, primaryCommunity } from "../hierarchy";
import type { Community, Dataset, Entity, Partition, Relationship } from "../model";

export interface SubgraphOptions {
  /** Members shown, highest degree first. */
  maxNodes: number;
  includeBoundary: boolean;
  /** Outside entities drawn as ghosts, most connected to the community first. */
  maxBoundaryNodes: number;
  /** When set, only relationships of these types are drawn. */
  relationshipTypes?: Set<string>;
}

export interface SubgraphNode {
  entity: Entity;
  /** True for outside entities that only appear because a boundary relationship reaches them. */
  ghost: boolean;
  /** Most specific community of the entity in the partition, when it has one. */
  community?: Community;
}

export interface SubgraphEdge {
  relationship: Relationship;
  boundary: boolean;
}

export interface SubgraphStats {
  members: number;
  shownMembers: number;
  internalEdges: number;
  boundaryEdges: number;
  ghostNodes: number;
  /** Boundary relationships dropped because their outside endpoint did not make the ghost cut. */
  hiddenBoundaryEdges: number;
}

export interface Subgraph {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  stats: SubgraphStats;
  /** Relationship types touching the shown members (before the type filter), with counts. */
  typeCounts: Map<string, number>;
}

const byDegree = (a: Entity, b: Entity) => b.degree - a.degree || a.title.localeCompare(b.title);

/** Members and relationships of one or more communities, bounded for rendering. */
export function communitySubgraph(dataset: Dataset, partition: Partition, communityIds: string[], options: SubgraphOptions): Subgraph {
  const memberIds = new Set<string>();
  for (const id of communityIds) partition.communities.get(id)?.entityIds.forEach((e) => memberIds.add(e));
  const members = [...memberIds].map((id) => dataset.entities.get(id)).filter((e): e is Entity => e !== undefined).sort(byDegree);
  const shown = members.slice(0, options.maxNodes);
  const shownIds = new Set(shown.map((e) => e.id));

  const typeCounts = new Map<string, number>();
  const internal: Relationship[] = [];
  const boundary: Relationship[] = [];
  for (const relationship of dataset.relationships) {
    const inSource = shownIds.has(relationship.sourceId);
    const inTarget = shownIds.has(relationship.targetId);
    if (!inSource && !inTarget) continue;
    typeCounts.set(relationship.type, (typeCounts.get(relationship.type) ?? 0) + 1);
    if (options.relationshipTypes && !options.relationshipTypes.has(relationship.type)) continue;
    if (inSource && inTarget) internal.push(relationship);
    else boundary.push(relationship);
  }

  const index = membershipIndex(partition);
  const nodes: SubgraphNode[] = shown.map((entity) => ({ entity, ghost: false, community: primaryCommunity(index, entity.id) }));
  const edges: SubgraphEdge[] = internal.map((relationship) => ({ relationship, boundary: false }));
  let ghostNodes = 0;
  let hiddenBoundaryEdges = 0;
  let boundaryEdges = 0;

  if (options.includeBoundary && boundary.length > 0) {
    const touches = new Map<string, number>();
    for (const relationship of boundary) {
      const outside = shownIds.has(relationship.sourceId) ? relationship.targetId : relationship.sourceId;
      touches.set(outside, (touches.get(outside) ?? 0) + 1);
    }
    const ghosts = [...touches.entries()]
      .map(([id, count]) => ({ entity: dataset.entities.get(id), count }))
      .filter((g): g is { entity: Entity; count: number } => g.entity !== undefined)
      .sort((a, b) => b.count - a.count || byDegree(a.entity, b.entity))
      .slice(0, options.maxBoundaryNodes);
    const ghostIds = new Set(ghosts.map((g) => g.entity.id));
    for (const ghost of ghosts) nodes.push({ entity: ghost.entity, ghost: true, community: primaryCommunity(index, ghost.entity.id) });
    for (const relationship of boundary) {
      const outside = shownIds.has(relationship.sourceId) ? relationship.targetId : relationship.sourceId;
      if (ghostIds.has(outside)) {
        edges.push({ relationship, boundary: true });
        boundaryEdges += 1;
      } else {
        hiddenBoundaryEdges += 1;
      }
    }
    ghostNodes = ghosts.length;
  } else {
    hiddenBoundaryEdges = boundary.length;
  }

  return {
    nodes,
    edges,
    stats: { members: members.length, shownMembers: shown.length, internalEdges: internal.length, boundaryEdges, ghostNodes, hiddenBoundaryEdges },
    typeCounts,
  };
}

/** Relationships touching an entity, for the inspector. */
export function relationshipsOf(dataset: Dataset, entityId: string): Relationship[] {
  return dataset.relationships.filter((r) => r.sourceId === entityId || r.targetId === entityId);
}
