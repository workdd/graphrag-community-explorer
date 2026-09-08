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

export interface LeafBundle {
  /** Entities folded into this node. */
  entityIds: string[];
  type: string;
  relationshipType: string;
  /** The node they all hang off. */
  hubId: string;
  /** True when the leaves were the source of their relationship. */
  outgoing: boolean;
}

export interface SubgraphNode {
  entity: Entity;
  /** True for outside entities that only appear because a boundary relationship reaches them. */
  ghost: boolean;
  /** Most specific community of the entity in the partition, when it has one. */
  community?: Community;
  /** Set when the node stands for several degree-one leaves of the same type on the same hub. */
  bundle?: LeafBundle;
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

export const BUNDLE_PREFIX = "bundle:";

/**
 * Folds degree-one leaves that share a hub, an entity type and a relationship type into one node
 * each, so a hub with 40 attached volumes shows one "40 x BlockStorage" instead of 40 spokes.
 * Ghost nodes and the `keep` entity are never folded. Groups below `minGroup` stay as they are.
 */
export function bundleLeaves(subgraph: Subgraph, options: { minGroup?: number; keep?: string } = {}): Subgraph {
  const minGroup = options.minGroup ?? 3;
  const internal = subgraph.edges.filter((e) => !e.boundary);
  const degree = new Map<string, number>();
  const only = new Map<string, SubgraphEdge>();
  for (const edge of subgraph.edges) {
    for (const id of [edge.relationship.sourceId, edge.relationship.targetId]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      only.set(id, edge);
    }
  }
  const byId = new Map(subgraph.nodes.map((n) => [n.entity.id, n]));
  const groups = new Map<string, { hubId: string; type: string; relationshipType: string; outgoing: boolean; members: SubgraphNode[]; edge: SubgraphEdge[] }>();
  for (const node of subgraph.nodes) {
    const id = node.entity.id;
    if (node.ghost || node.bundle || id === options.keep || degree.get(id) !== 1) continue;
    const edge = only.get(id)!;
    if (edge.boundary || !internal.includes(edge)) continue;
    const outgoing = edge.relationship.sourceId === id;
    const hubId = outgoing ? edge.relationship.targetId : edge.relationship.sourceId;
    if (hubId === id || !byId.has(hubId)) continue;
    const key = `${hubId}|${node.entity.type}|${edge.relationship.type}|${outgoing ? "out" : "in"}`;
    const group = groups.get(key) ?? { hubId, type: node.entity.type, relationshipType: edge.relationship.type, outgoing, members: [], edge: [] };
    group.members.push(node);
    group.edge.push(edge);
    groups.set(key, group);
  }
  const folded = new Set<string>();
  const removedEdges = new Set<SubgraphEdge>();
  const bundles: SubgraphNode[] = [];
  const bundleEdges: SubgraphEdge[] = [];
  for (const [key, group] of groups) {
    if (group.members.length < minGroup) continue;
    const entityIds = group.members.map((m) => m.entity.id);
    group.members.forEach((m) => folded.add(m.entity.id));
    group.edge.forEach((e) => removedEdges.add(e));
    const id = `${BUNDLE_PREFIX}${key}`;
    const degreeSum = group.members.reduce((s, m) => s + m.entity.degree, 0);
    bundles.push({
      entity: { id, title: `${entityIds.length} × ${group.type}`, type: group.type, degree: degreeSum, textUnitIds: [] },
      ghost: false,
      community: group.members[0].community,
      bundle: { entityIds, type: group.type, relationshipType: group.relationshipType, hubId: group.hubId, outgoing: group.outgoing },
    });
    bundleEdges.push({
      relationship: {
        id: `${BUNDLE_PREFIX}edge:${key}`,
        sourceId: group.outgoing ? id : group.hubId,
        targetId: group.outgoing ? group.hubId : id,
        type: group.relationshipType,
        textUnitIds: [],
        description: `${entityIds.length} relationships of type ${group.relationshipType}`,
      },
      boundary: false,
    });
  }
  if (bundles.length === 0) return subgraph;
  return {
    ...subgraph,
    nodes: [...subgraph.nodes.filter((n) => !folded.has(n.entity.id)), ...bundles],
    edges: [...subgraph.edges.filter((e) => !removedEdges.has(e)), ...bundleEdges],
  };
}

/** Relationships touching an entity, for the inspector. */
export function relationshipsOf(dataset: Dataset, entityId: string): Relationship[] {
  return dataset.relationships.filter((r) => r.sourceId === entityId || r.targetId === entityId);
}
