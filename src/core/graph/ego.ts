// What one record is connected to, in a form a person can read. A hub with hundreds of neighbours
// tells you nothing when they are all drawn; a few named ones plus a count of the rest tells you the
// shape. Neighbours are grouped by the relationship that reaches them and the type they are, and
// each group shows its busiest members and keeps the remainder as a number.
import type { Dataset, Entity } from "../model";

export type Direction = "out" | "in";

export interface EgoGroup {
  /** Stable across renders and expansions: direction, relationship and neighbour type. */
  key: string;
  relationship: string;
  direction: Direction;
  neighbourType: string;
  /** Neighbours reached this way. */
  total: number;
  /** The ones drawn with their own names, busiest first. */
  shown: Entity[];
  /** How many the group stands for beyond the ones shown. */
  hidden: number;
}

export interface EgoModel {
  seed: Entity;
  groups: EgoGroup[];
  /** Distinct neighbours over all groups. */
  neighbours: number;
  relationships: number;
}

export interface EgoOptions {
  /** Named neighbours per group before the rest becomes a count. */
  perGroup?: number;
  /** Named neighbours for a group the reader has opened. */
  perOpenGroup?: number;
  /** Group keys the reader has opened. */
  opened?: ReadonlySet<string>;
}

export const groupKey = (direction: Direction, relationship: string, neighbourType: string) =>
  `${direction}/${relationship}/${neighbourType}`;

/**
 * The neighbourhood of one entity, grouped so that a hub reads as a handful of names and a set of
 * counts rather than a wall. Groups come back busiest first.
 */
export function egoSummary(dataset: Dataset, seedId: string, options: EgoOptions = {}): EgoModel | null {
  const seed = dataset.entities.get(seedId);
  if (!seed) return null;
  const perGroup = options.perGroup ?? 3;
  const perOpenGroup = options.perOpenGroup ?? 60;
  const opened = options.opened ?? new Set<string>();

  const buckets = new Map<string, { relationship: string; direction: Direction; neighbourType: string; members: Map<string, Entity> }>();
  let relationships = 0;
  const neighbours = new Set<string>();
  for (const relationship of dataset.relationships) {
    const outward = relationship.sourceId === seedId;
    const inward = relationship.targetId === seedId;
    if (!outward && !inward) continue;
    const otherId = outward ? relationship.targetId : relationship.sourceId;
    if (otherId === seedId) continue;
    const other = dataset.entities.get(otherId);
    if (!other) continue;
    relationships += 1;
    neighbours.add(other.id);
    const direction: Direction = outward ? "out" : "in";
    const key = groupKey(direction, relationship.type, other.type);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { relationship: relationship.type, direction, neighbourType: other.type, members: new Map() };
      buckets.set(key, bucket);
    }
    bucket.members.set(other.id, other);
  }

  const groups: EgoGroup[] = [...buckets.entries()].map(([key, bucket]) => {
    const members = [...bucket.members.values()].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title));
    const limit = opened.has(key) ? perOpenGroup : perGroup;
    const shown = members.slice(0, limit);
    return {
      key,
      relationship: bucket.relationship,
      direction: bucket.direction,
      neighbourType: bucket.neighbourType,
      total: members.length,
      shown,
      hidden: members.length - shown.length,
    };
  });
  groups.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  return { seed, groups, neighbours: neighbours.size, relationships };
}

/** Entities drawn for a model: the seed and every named neighbour, without repeats. */
export function egoEntities(model: EgoModel): Entity[] {
  const seen = new Map<string, Entity>([[model.seed.id, model.seed]]);
  for (const group of model.groups) for (const entity of group.shown) seen.set(entity.id, entity);
  return [...seen.values()];
}
