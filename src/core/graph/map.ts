import { membershipIndex } from "../hierarchy";
import type { Community, Dataset, Entity, Partition, Relationship } from "../model";

export const UNASSIGNED_ID = "unassigned";

export interface MapOptions {
  /** null draws the hierarchy from its roots; a number draws every community of that level side by side. */
  baseLevel: number | null;
  /** Community ids (or UNASSIGNED_ID) whose members are drawn as entities. */
  expanded: Set<string>;
  showUnassigned: boolean;
  /** Entities drawn in total; expansions beyond it are truncated, most connected first. */
  maxEntities: number;
}

export interface MapCommunity {
  community: Community;
  open: boolean;
  /** Community drawn as this one's container (nested hierarchies only). */
  containerId?: string;
}

export interface MapEntity {
  entity: Entity;
  /** Community id or UNASSIGNED_ID. */
  containerId: string;
}

export interface MapAggregateEdge {
  /** Node keys: `community:<id>`, `entity:<id>` or UNASSIGNED_ID. */
  a: string;
  b: string;
  count: number;
}

export interface MapModel {
  nested: boolean;
  communities: MapCommunity[];
  entities: MapEntity[];
  aggregateEdges: MapAggregateEdge[];
  entityEdges: Relationship[];
  parentLinks: { childId: string; parentId: string }[];
  unassigned: { total: number; drawn: number; open: boolean } | null;
  stats: { communityNodes: number; entityNodes: number; truncatedEntities: number };
}

export const communityKey = (id: string) => `community:${id}`;
export const entityKey = (id: string) => `entity:${id}`;

/** Share of child communities whose members all sit inside their parent. */
export function nestingRatio(partition: Partition): number {
  let children = 0;
  let nested = 0;
  for (const community of partition.communities.values()) {
    if (community.parentId === null) continue;
    const parent = partition.communities.get(community.parentId);
    if (!parent) continue;
    children += 1;
    const inParent = new Set(parent.entityIds);
    if (community.entityIds.every((id) => inParent.has(id))) nested += 1;
  }
  return children === 0 ? 1 : nested / children;
}

const byDegree = (a: Entity, b: Entity) => b.degree - a.degree || a.title.localeCompare(b.title);

export function buildMapModel(dataset: Dataset, partition: Partition, options: MapOptions): MapModel {
  const nested = nestingRatio(partition) >= 0.9;
  const drawn = new Map<string, MapCommunity>();
  const roots = [...partition.communities.values()].filter((c) => c.parentId === null || !partition.communities.has(c.parentId));

  if (options.baseLevel !== null) {
    for (const community of partition.communities.values()) {
      if (community.level === options.baseLevel) drawn.set(community.id, { community, open: options.expanded.has(community.id) });
    }
  } else if (nested) {
    // Hierarchy mode: children appear inside a parent only once the parent is opened.
    const visit = (community: Community, containerId?: string) => {
      const open = options.expanded.has(community.id);
      drawn.set(community.id, { community, open, containerId });
      if (!open) return;
      for (const childId of community.childIds) {
        const child = partition.communities.get(childId);
        if (child && !drawn.has(childId)) visit(child, community.id);
      }
    };
    roots.forEach((root) => visit(root));
  } else {
    // Parents do not contain their children, so every community stands on its own and parent links say who reports to whom.
    for (const community of partition.communities.values()) drawn.set(community.id, { community, open: options.expanded.has(community.id) });
  }

  const index = membershipIndex(partition);
  const entityNodes = new Map<string, MapEntity>();
  let truncated = 0;
  let budget = options.maxEntities;
  const drawMembers = (containerId: string, candidates: Entity[]) => {
    const sorted = [...candidates].sort(byDegree);
    for (const entity of sorted) {
      if (entityNodes.has(entity.id)) continue;
      if (budget <= 0) {
        truncated += 1;
        continue;
      }
      entityNodes.set(entity.id, { entity, containerId });
      budget -= 1;
    }
  };
  for (const node of [...drawn.values()].filter((d) => d.open)) {
    const childDrawn = new Set(node.community.childIds.filter((id) => drawn.get(id)?.containerId === node.community.id));
    const members = node.community.entityIds
      .map((id) => dataset.entities.get(id))
      .filter((e): e is Entity => e !== undefined)
      // In a nested hierarchy an open parent shows only members that no drawn child already holds.
      .filter((e) => !(index.get(e.id) ?? []).some((c) => childDrawn.has(c.id)));
    drawMembers(node.community.id, members);
  }

  let unassigned: MapModel["unassigned"] = null;
  if (options.showUnassigned) {
    const loose = [...dataset.entities.values()].filter((e) => !index.has(e.id));
    const open = options.expanded.has(UNASSIGNED_ID);
    if (open) drawMembers(UNASSIGNED_ID, loose);
    unassigned = { total: loose.length, drawn: open ? loose.filter((e) => entityNodes.has(e.id)).length : 0, open };
  }

  // Each relationship endpoint lands on the most specific drawn node that holds the entity.
  const ownerOf = (entityId: string): string | null => {
    if (entityNodes.has(entityId)) return entityKey(entityId);
    const holders = (index.get(entityId) ?? []).filter((c) => drawn.has(c.id)).sort((a, b) => a.size - b.size);
    if (holders.length > 0) return communityKey(holders[0].id);
    return unassigned ? UNASSIGNED_ID : null;
  };
  const aggregate = new Map<string, MapAggregateEdge>();
  const entityEdges: Relationship[] = [];
  for (const relationship of dataset.relationships) {
    const a = ownerOf(relationship.sourceId);
    const b = ownerOf(relationship.targetId);
    if (a === null || b === null || a === b) continue;
    if (a.startsWith("entity:") && b.startsWith("entity:")) {
      entityEdges.push(relationship);
      continue;
    }
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    const edge = aggregate.get(key) ?? { a: x, b: y, count: 0 };
    edge.count += 1;
    aggregate.set(key, edge);
  }

  const parentLinks = nested || options.baseLevel !== null
    ? []
    : [...drawn.values()]
        .filter((d) => d.community.parentId !== null && drawn.has(d.community.parentId))
        .map((d) => ({ childId: d.community.id, parentId: d.community.parentId! }));

  return {
    nested,
    communities: [...drawn.values()],
    entities: [...entityNodes.values()],
    aggregateEdges: [...aggregate.values()].sort((p, q) => q.count - p.count),
    entityEdges,
    parentLinks,
    unassigned,
    stats: { communityNodes: drawn.size, entityNodes: entityNodes.size, truncatedEntities: truncated },
  };
}
