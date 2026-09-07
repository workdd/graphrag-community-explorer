import type { Dataset, Partition } from "../model";
import { membershipIndex } from "../hierarchy";

export interface CommunityMetrics {
  internalEdges: number;
  boundaryEdges: number;
  /** internal / (internal + boundary); 0 when the community touches no relationship. */
  internalRatio: number;
}

export interface PartitionSummary {
  coveredEntities: number;
  coverage: number;
  /** Entities that sit in two or more communities of the same level. */
  multiMembership: number;
  metrics: Map<string, CommunityMetrics>;
}

export interface DatasetCounts {
  entities: number;
  relationships: number;
  isolatedEntities: number;
  entityTypes: Map<string, number>;
  relationshipTypes: Map<string, number>;
}

export function datasetCounts(dataset: Dataset): DatasetCounts {
  const entityTypes = new Map<string, number>();
  let isolatedEntities = 0;
  for (const entity of dataset.entities.values()) {
    entityTypes.set(entity.type, (entityTypes.get(entity.type) ?? 0) + 1);
    if (entity.degree === 0) isolatedEntities += 1;
  }
  const relationshipTypes = new Map<string, number>();
  for (const relationship of dataset.relationships) {
    relationshipTypes.set(relationship.type, (relationshipTypes.get(relationship.type) ?? 0) + 1);
  }
  return { entities: dataset.entities.size, relationships: dataset.relationships.length, isolatedEntities, entityTypes, relationshipTypes };
}

export function summarizePartition(dataset: Dataset, partition: Partition): PartitionSummary {
  const index = membershipIndex(partition);
  const metrics = new Map<string, CommunityMetrics>();
  for (const id of partition.communities.keys()) metrics.set(id, { internalEdges: 0, boundaryEdges: 0, internalRatio: 0 });

  // Walk relationships once; each endpoint's memberships decide internal vs boundary per community.
  for (const relationship of dataset.relationships) {
    const a = (index.get(relationship.sourceId) ?? []).map((c) => c.id);
    const b = (index.get(relationship.targetId) ?? []).map((c) => c.id);
    const inB = new Set(b);
    const inA = new Set(a);
    for (const id of a) {
      const m = metrics.get(id)!;
      if (inB.has(id)) m.internalEdges += 1;
      else m.boundaryEdges += 1;
    }
    for (const id of b) {
      if (!inA.has(id)) metrics.get(id)!.boundaryEdges += 1;
    }
  }
  for (const m of metrics.values()) {
    const total = m.internalEdges + m.boundaryEdges;
    m.internalRatio = total === 0 ? 0 : m.internalEdges / total;
  }
  // Nesting puts every entity in a parent and a child; only overlap on the same level is worth reporting.
  let multiMembership = 0;
  for (const communities of index.values()) {
    const levels = new Set(communities.map((c) => c.level));
    if (levels.size < communities.length) multiMembership += 1;
  }
  const coveredEntities = index.size;
  return {
    coveredEntities,
    coverage: dataset.entities.size === 0 ? 0 : coveredEntities / dataset.entities.size,
    multiMembership,
    metrics,
  };
}
