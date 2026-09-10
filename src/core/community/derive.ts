// Communities computed here, when the index arrived without any.
//
// A graph exported from a database or a spreadsheet has no community structure attached, and until
// now that meant half the product was dark: no hierarchy, no map, no quality, no coverage, and the
// health view could say nothing about grouping. The Leiden run was already in the browser, playing
// itself back as an animation; this makes its result a community set the rest of the app can use.
//
// What is computed is never confused with what was loaded. A set carries the fact that it was
// derived, and every view that names it says so.
import { buildGraph, runLeiden } from "./leiden";
import type { Community, Dataset, Partition } from "../model";

export interface DeriveOptions {
  /** Higher splits the graph into more, smaller communities. */
  resolution?: number;
  seed?: number;
  /** Names the set in the picker. */
  label?: string;
}

/** Two busiest members and a count: enough to recognise a group nobody has named. */
export function nameCommunity(dataset: Dataset, ids: string[]): string {
  const members = ids
    .map((id) => dataset.entities.get(id))
    .filter((entity): entity is NonNullable<typeof entity> => entity !== undefined)
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title));
  if (members.length === 0) return "Empty";
  if (members.length === 1) return members[0].title;
  const [first, second] = members;
  if (members.length === 2) return `${first.title} and ${second.title}`;
  return `${first.title}, ${second.title} and ${members.length - 2} more`;
}

/** A level nobody can learn anything from: one community, or one community per node. */
const worthKeeping = (membership: Int32Array, nodes: number): boolean => {
  const groups = new Set(membership).size;
  return groups > 1 && groups < nodes;
};

const signature = (membership: Int32Array): string => membership.join(",");

export function derivePartition(dataset: Dataset, options: DeriveOptions = {}): Partition {
  const { graph, entityIds } = buildGraph(dataset);
  const result = runLeiden(graph, { resolution: options.resolution, seed: options.seed });

  // Leiden reports finest first; a hierarchy reads from the root down, so the coarsest is level 0.
  const kept: Int32Array[] = [];
  const seen = new Set<string>();
  for (let i = result.levels.length - 1; i >= 0; i -= 1) {
    const membership = result.levels[i];
    if (!worthKeeping(membership, entityIds.length)) continue;
    const key = signature(membership);
    // Rounds that changed nothing would show as two identical levels.
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(membership);
  }

  const communities = new Map<string, Community>();
  const byLevel: Map<string, string>[] = [];

  kept.forEach((membership, level) => {
    const members = new Map<number, string[]>();
    membership.forEach((group, node) => {
      const list = members.get(group);
      if (list) list.push(entityIds[node]);
      else members.set(group, [entityIds[node]]);
    });
    const owner = new Map<string, string>();
    for (const [group, ids] of [...members.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const id = `L${level}-${group}`;
      for (const entityId of ids) owner.set(entityId, id);
      communities.set(id, {
        id,
        level,
        parentId: null,
        childIds: [],
        title: nameCommunity(dataset, ids),
        entityIds: ids,
        relationshipIds: [],
        size: ids.length,
        membershipSource: "entity_ids",
        textUnitIds: [],
      });
    }
    byLevel.push(owner);
  });

  // A finer community sits wholly inside one coarser one, so any member decides the parent.
  for (let level = 1; level < byLevel.length; level += 1) {
    for (const community of communities.values()) {
      if (community.level !== level) continue;
      const parentId = byLevel[level - 1].get(community.entityIds[0]);
      if (parentId === undefined) continue;
      community.parentId = parentId;
      communities.get(parentId)?.childIds.push(community.id);
    }
  }

  // Relationships with both ends inside, which is what every count of internal edges reads.
  for (const relationship of dataset.relationships) {
    for (let level = 0; level < byLevel.length; level += 1) {
      const a = byLevel[level].get(relationship.sourceId);
      if (a === undefined || a !== byLevel[level].get(relationship.targetId)) continue;
      communities.get(a)?.relationshipIds.push(relationship.id);
    }
  }

  return {
    id: "derived",
    label: options.label ?? "Leiden",
    communities,
    levels: kept.map((_, level) => level),
    rootLevel: 0,
    computed: { algorithm: "leiden", modularity: result.modularity, resolution: options.resolution ?? 1 },
  };
}
