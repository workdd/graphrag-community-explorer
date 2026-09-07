import type { Dataset, Partition } from "../model";

export interface IntegrityFinding {
  kind: string;
  severity: "warning" | "info";
  label: string;
  count: number;
  samples: string[];
}

/** Structural checks on a normalized partition. Row-level problems are reported by the loader. */
export function checkIntegrity(dataset: Dataset, partition: Partition): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const add = (kind: string, severity: IntegrityFinding["severity"], label: string, samples: string[], count = samples.length) => {
    if (count > 0) findings.push({ kind, severity, label, count, samples: samples.slice(0, 5) });
  };

  const missingParent: string[] = [];
  const notNested: string[] = [];
  const empty: string[] = [];
  const sizeMismatch: string[] = [];
  const inferred: string[] = [];
  const cycles: string[] = [];

  for (const community of partition.communities.values()) {
    if (community.parentId !== null) {
      const parent = partition.communities.get(community.parentId);
      if (!parent) {
        missingParent.push(`${community.title} -> ${community.parentId}`);
      } else {
        const parentMembers = new Set(parent.entityIds);
        const outside = community.entityIds.filter((id) => !parentMembers.has(id)).length;
        if (outside > 0) notNested.push(`${community.title}: ${outside} of ${community.entityIds.length} not in ${parent.title}`);
      }
    }
    if (community.entityIds.length === 0) empty.push(community.title);
    if (community.membershipSource === "entity_ids" && community.size !== community.entityIds.length) {
      sizeMismatch.push(`${community.title}: size ${community.size}, members ${community.entityIds.length}`);
    }
    if (community.membershipSource === "relationship_ids") inferred.push(community.title);

    const seen = new Set<string>([community.id]);
    let cursor = community.parentId;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        cycles.push(community.title);
        break;
      }
      seen.add(cursor);
      cursor = partition.communities.get(cursor)?.parentId ?? null;
    }
  }

  add("missing-parent", "warning", "Parent community not found", missingParent);
  add("parent-cycle", "warning", "Parent chain loops back on itself", cycles);
  add("not-nested", "warning", "Child members missing from the parent community", notNested);
  add("size-mismatch", "warning", "Stored size differs from the member count", sizeMismatch);
  add("empty-community", "warning", "Communities without members", empty);
  add("inferred-membership", "info", "Members inferred from relationship endpoints (no entity_ids column)", inferred);

  const covered = new Set<string>();
  for (const community of partition.communities.values()) community.entityIds.forEach((id) => covered.add(id));
  const uncovered = [...dataset.entities.values()].filter((e) => !covered.has(e.id));
  add("uncovered-entities", "info", "Entities that belong to no community", uncovered.map((e) => e.title), uncovered.length);
  const isolated = [...dataset.entities.values()].filter((e) => e.degree === 0);
  add("isolated-entities", "info", "Entities with no relationships", isolated.map((e) => e.title), isolated.length);
  return findings;
}
