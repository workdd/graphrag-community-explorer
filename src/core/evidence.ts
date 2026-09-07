import type { Community, Dataset, TextUnit } from "./model";

export interface Evidence {
  unit: TextUnit;
  documentTitles: string[];
}

const withDocuments = (dataset: Dataset, units: TextUnit[]): Evidence[] =>
  units.map((unit) => ({
    unit,
    documentTitles: unit.documentIds.map((id) => dataset.documents.get(id)?.title ?? id),
  }));

/** Text units that mention the entity: the entity's own list first, then units that list it, without duplicates. */
export function evidenceForEntity(dataset: Dataset, entityId: string): Evidence[] {
  const entity = dataset.entities.get(entityId);
  const seen = new Set<string>();
  const units: TextUnit[] = [];
  for (const id of entity?.textUnitIds ?? []) {
    const unit = dataset.textUnits.get(id);
    if (unit && !seen.has(id)) {
      seen.add(id);
      units.push(unit);
    }
  }
  for (const unit of dataset.textUnits.values()) {
    if (!seen.has(unit.id) && unit.entityIds.includes(entityId)) {
      seen.add(unit.id);
      units.push(unit);
    }
  }
  return withDocuments(dataset, units);
}

export function evidenceForRelationship(dataset: Dataset, relationshipId: string): Evidence[] {
  const relationship = dataset.relationships.find((r) => r.id === relationshipId);
  const seen = new Set<string>();
  const units: TextUnit[] = [];
  for (const id of relationship?.textUnitIds ?? []) {
    const unit = dataset.textUnits.get(id);
    if (unit && !seen.has(id)) {
      seen.add(id);
      units.push(unit);
    }
  }
  for (const unit of dataset.textUnits.values()) {
    if (!seen.has(unit.id) && unit.relationshipIds.includes(relationshipId)) {
      seen.add(unit.id);
      units.push(unit);
    }
  }
  return withDocuments(dataset, units);
}

/** A community's own text units, or, when the file has none, the units of its members ranked by how many members they mention. */
export function evidenceForCommunity(dataset: Dataset, community: Community, limit = 20): Evidence[] {
  const own = community.textUnitIds.map((id) => dataset.textUnits.get(id)).filter((u): u is TextUnit => u !== undefined);
  if (own.length > 0) return withDocuments(dataset, own.slice(0, limit));
  const members = new Set(community.entityIds);
  const ranked = [...dataset.textUnits.values()]
    .map((unit) => ({ unit, hits: unit.entityIds.filter((id) => members.has(id)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.unit);
  return withDocuments(dataset, ranked);
}

/** First sentence-ish slice of a chunk for list views. */
export function snippet(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (stop > max * 0.3 ? cut.slice(0, stop + 1) : cut) + " …";
}
