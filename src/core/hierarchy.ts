import type { Community, Partition } from "./model";

export interface TreeNode {
  community: Community;
  depth: number;
  children: TreeNode[];
}

const bySize = (a: Community, b: Community) => b.size - a.size || a.title.localeCompare(b.title);

/** Roots are parentless communities and those whose parent is missing. Cycles are cut at the first repeat. */
export function buildTree(partition: Partition): TreeNode[] {
  const byParent = new Map<string | null, Community[]>();
  for (const community of partition.communities.values()) {
    const parent = community.parentId !== null && partition.communities.has(community.parentId) ? community.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), community]);
  }
  const make = (community: Community, depth: number, seen: Set<string>): TreeNode => ({
    community,
    depth,
    children: (byParent.get(community.id) ?? [])
      .filter((child) => !seen.has(child.id))
      .sort(bySize)
      .map((child) => make(child, depth + 1, new Set([...seen, child.id]))),
  });
  return (byParent.get(null) ?? []).sort(bySize).map((root) => make(root, 0, new Set([root.id])));
}

/** Ancestors first, the community itself last. Stops at missing parents and cycles. */
export function pathTo(partition: Partition, id: string): Community[] {
  const path: Community[] = [];
  const seen = new Set<string>();
  let current = partition.communities.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId !== null ? partition.communities.get(current.parentId) : undefined;
  }
  return path;
}

/** Distance from the root level, so depth reads the same whether roots are level 0 or the highest number. */
export function depthOfLevel(partition: Partition, level: number): number {
  return Math.abs(level - partition.rootLevel);
}

export function membershipIndex(partition: Partition): Map<string, Community[]> {
  const index = new Map<string, Community[]>();
  for (const community of partition.communities.values()) {
    for (const entityId of community.entityIds) {
      index.set(entityId, [...(index.get(entityId) ?? []), community]);
    }
  }
  return index;
}

/** The smallest community wins: hierarchy parents contain their children's members, and the child describes the entity. */
export function primaryCommunity(index: Map<string, Community[]>, entityId: string): Community | undefined {
  const candidates = index.get(entityId);
  if (!candidates || candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => a.size - b.size || a.id.localeCompare(b.id, undefined, { numeric: true }))[0];
}
