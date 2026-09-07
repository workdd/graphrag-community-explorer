import { membershipIndex, primaryCommunity } from "../hierarchy";
import type { Community, Dataset, Partition } from "../model";
import { summarizePartition } from "./summary";

export interface CommunityQuality {
  size: number;
  internalEdges: number;
  boundaryEdges: number;
  internalRatio: number;
  /** Internal edges over possible member pairs (parallel edges count, so it can exceed 1 on multigraphs). */
  density: number;
  /** Boundary edges over the volume touching the community: 0 is isolated, 1 is all edges leaving. */
  conductance: number;
  /** Mean number of internal relationships per member. */
  averageDegree: number;
}

export interface LevelQuality {
  level: number;
  communities: number;
  coveredEntities: number;
  coverage: number;
  /** Newman modularity of the level's communities over all relationships; unassigned entities contribute nothing. */
  modularity: number;
  medianSize: number;
  largestSize: number;
}

export function communityQuality(dataset: Dataset, partition: Partition): Map<string, CommunityQuality> {
  const summary = summarizePartition(dataset, partition);
  const out = new Map<string, CommunityQuality>();
  for (const community of partition.communities.values()) {
    const m = summary.metrics.get(community.id) ?? { internalEdges: 0, boundaryEdges: 0, internalRatio: 0 };
    const n = community.entityIds.length;
    const pairs = (n * (n - 1)) / 2;
    const volume = 2 * m.internalEdges + m.boundaryEdges;
    out.set(community.id, {
      size: n,
      internalEdges: m.internalEdges,
      boundaryEdges: m.boundaryEdges,
      internalRatio: m.internalRatio,
      density: pairs === 0 ? 0 : m.internalEdges / pairs,
      conductance: volume === 0 ? 0 : m.boundaryEdges / volume,
      averageDegree: n === 0 ? 0 : (2 * m.internalEdges) / n,
    });
  }
  return out;
}

/** Primary community of every entity at one level: the smallest one holding it. */
export function assignmentAtLevel(partition: Partition, level: number): Map<string, string> {
  const atLevel: Partition = {
    ...partition,
    communities: new Map([...partition.communities].filter(([, c]) => c.level === level)),
  };
  const index = membershipIndex(atLevel);
  const assignment = new Map<string, string>();
  for (const entityId of index.keys()) {
    const community = primaryCommunity(index, entityId);
    if (community) assignment.set(entityId, community.id);
  }
  return assignment;
}

export function modularity(dataset: Dataset, assignment: Map<string, string>): number {
  const m = dataset.relationships.length;
  if (m === 0) return 0;
  const internal = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const r of dataset.relationships) {
    const a = assignment.get(r.sourceId);
    const b = assignment.get(r.targetId);
    if (a !== undefined) degree.set(a, (degree.get(a) ?? 0) + 1);
    if (b !== undefined) degree.set(b, (degree.get(b) ?? 0) + 1);
    if (a !== undefined && a === b) internal.set(a, (internal.get(a) ?? 0) + 1);
  }
  let q = 0;
  for (const [community, d] of degree) q += (internal.get(community) ?? 0) / m - (d / (2 * m)) ** 2;
  return q;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function levelQuality(dataset: Dataset, partition: Partition): LevelQuality[] {
  return partition.levels.map((level) => {
    const communities = [...partition.communities.values()].filter((c) => c.level === level);
    const assignment = assignmentAtLevel(partition, level);
    const sizes = communities.map((c) => c.entityIds.length);
    return {
      level,
      communities: communities.length,
      coveredEntities: assignment.size,
      coverage: dataset.entities.size === 0 ? 0 : assignment.size / dataset.entities.size,
      modularity: modularity(dataset, assignment),
      medianSize: median(sizes),
      largestSize: Math.max(0, ...sizes),
    };
  });
}

/** Bucketed size counts for the distribution chart. */
export const SIZE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "1-4", min: 1, max: 4 },
  { label: "5-9", min: 5, max: 9 },
  { label: "10-24", min: 10, max: 24 },
  { label: "25-49", min: 25, max: 49 },
  { label: "50-99", min: 50, max: 99 },
  { label: "100-249", min: 100, max: 249 },
  { label: "250+", min: 250, max: Infinity },
];

export function sizeHistogram(communities: Iterable<Community>): number[] {
  const counts = SIZE_BUCKETS.map(() => 0);
  for (const community of communities) {
    const n = community.entityIds.length;
    const bucket = SIZE_BUCKETS.findIndex((b) => n >= b.min && n <= b.max);
    if (bucket >= 0) counts[bucket] += 1;
  }
  return counts;
}
