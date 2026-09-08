// The relational side of an index: which Parquet tables were loaded, how their columns reference each
// other, and which rows GraphRAG's local search would rank for a selection. The views draw the graph;
// this module explains where every drawn element comes from.
import { membershipIndex, pathTo } from "./hierarchy";
import type { Community, Dataset, Entity, Partition, Relationship, TextUnit } from "./model";

export type TableKey = "documents" | "text_units" | "entities" | "relationships" | "communities" | "community_reports" | "covariates";

/** What a loader saw in one file: raw column names and row count, before any normalizing. */
export interface TableInfo {
  name: string;
  rows: number;
  columns: string[];
}

export interface ColumnRef {
  column: string;
  to: TableKey;
  toColumn: string;
}

export interface TableRole {
  key: TableKey;
  /** What the rows turn into on screen. */
  becomes: string;
  /** Columns that drive the drawing (label, colour, size, text). */
  usedColumns: string[];
  refs: ColumnRef[];
}

export const TABLE_ROLES: TableRole[] = [
  { key: "documents", becomes: "Documents that the text units were cut from", usedColumns: ["title"], refs: [] },
  {
    key: "text_units",
    becomes: "Source text shown behind a node, an edge or a community",
    usedColumns: ["text", "n_tokens"],
    refs: [
      { column: "document_ids", to: "documents", toColumn: "id" },
      { column: "entity_ids", to: "entities", toColumn: "id" },
      { column: "relationship_ids", to: "relationships", toColumn: "id" },
    ],
  },
  {
    key: "entities",
    becomes: "A node: label from title, colour from type, size from degree",
    usedColumns: ["title", "type", "description", "degree"],
    refs: [{ column: "text_unit_ids", to: "text_units", toColumn: "id" }],
  },
  {
    key: "relationships",
    becomes: "An edge from source to target, width from weight",
    usedColumns: ["description", "weight"],
    refs: [
      { column: "source", to: "entities", toColumn: "title" },
      { column: "target", to: "entities", toColumn: "title" },
      { column: "text_unit_ids", to: "text_units", toColumn: "id" },
    ],
  },
  {
    key: "communities",
    becomes: "A cloud around its member nodes; parent nests the clouds and builds the map",
    usedColumns: ["title", "level", "size"],
    refs: [
      { column: "entity_ids", to: "entities", toColumn: "id" },
      { column: "relationship_ids", to: "relationships", toColumn: "id" },
      { column: "parent", to: "communities", toColumn: "community" },
      { column: "text_unit_ids", to: "text_units", toColumn: "id" },
    ],
  },
  {
    key: "community_reports",
    becomes: "Summary, findings and rank on the community panel",
    usedColumns: ["summary", "findings", "rank"],
    refs: [{ column: "community", to: "communities", toColumn: "community" }],
  },
  {
    key: "covariates",
    becomes: "Claims listed on the entity panel",
    usedColumns: ["type", "description", "status"],
    refs: [
      { column: "subject_id", to: "entities", toColumn: "title" },
      { column: "object_id", to: "entities", toColumn: "title" },
    ],
  },
];

export type ColumnKind = "key" | "ref" | "used" | "plain";

export interface SchemaColumn {
  name: string;
  kind: ColumnKind;
  ref?: ColumnRef;
  /** The reference points at a table that was not loaded. */
  dangling?: boolean;
}

export interface SchemaTable {
  name: string;
  key: TableKey;
  loaded: boolean;
  rows: number;
  columns: SchemaColumn[];
  becomes: string;
  /** An additional community set (`<label>_communities.parquet`). */
  extra: boolean;
}

const ID_COLUMNS = new Set(["id", "human_readable_id"]);

function classify(name: string, role: TableRole, loadedKeys: Set<TableKey>): SchemaColumn {
  const ref = role.refs.find((r) => r.column === name);
  if (ref) return { name, kind: "ref", ref, dangling: !loadedKeys.has(ref.to) };
  if (ID_COLUMNS.has(name) || (role.key === "communities" && name === "community")) return { name, kind: "key" };
  if (role.usedColumns.includes(name)) return { name, kind: "used" };
  return { name, kind: "plain" };
}

/** Every known table in a fixed order, loaded or not, with its columns classified; extra community sets last. */
export function describeTables(tables: TableInfo[]): SchemaTable[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const loadedKeys = new Set(TABLE_ROLES.map((r) => r.key).filter((k) => byName.has(k)));
  const known = TABLE_ROLES.map((role): SchemaTable => {
    const info = byName.get(role.key);
    const columns = info
      ? info.columns.map((c) => classify(c, role, loadedKeys))
      : [...ID_COLUMNS].slice(0, 1).concat(role.usedColumns, role.refs.map((r) => r.column)).map((c) => classify(c, role, loadedKeys));
    return { name: role.key, key: role.key, loaded: Boolean(info), rows: info?.rows ?? 0, columns, becomes: role.becomes, extra: false };
  });
  const communityRole = TABLE_ROLES.find((r) => r.key === "communities")!;
  const extras = tables
    .filter((t) => !TABLE_ROLES.some((r) => r.key === t.name))
    .map((info): SchemaTable => ({
      name: info.name,
      key: "communities",
      loaded: true,
      rows: info.rows,
      columns: info.columns.map((c) => classify(c, communityRole, loadedKeys)),
      becomes: "Another community set, switchable in the top bar",
      extra: true,
    }));
  return [...known, ...extras];
}

/** What the context tables are built around. */
export type ContextScope = { kind: "all" } | { kind: "community"; id: string } | { kind: "entity"; id: string };

export interface CommunityRow {
  community: Community;
  /** Members among the scoped entities. */
  matches: number;
  rank?: number;
}
export interface EntityRow {
  entity: Entity;
}
export interface RelationshipRow {
  relationship: Relationship;
  /** in: both endpoints are scoped entities; out: one of them. */
  network: "in" | "out";
  combinedDegree: number;
  /** Text units that carry the relationship. */
  links: number;
}
export interface TextUnitRow {
  unit: TextUnit;
  entityHits: number;
  relationshipHits: number;
}

export interface ContextTables {
  scope: ContextScope;
  /** Entities the tables are built around, most connected first. */
  scoped: Entity[];
  communities: CommunityRow[];
  entities: EntityRow[];
  relationships: RelationshipRow[];
  textUnits: TextUnitRow[];
}

export interface ContextLimits {
  entities: number;
  inNetwork: number;
  outNetwork: number;
  textUnits: number;
  communities: number;
}

export const DEFAULT_LIMITS: ContextLimits = { entities: 15, inNetwork: 12, outNetwork: 8, textUnits: 10, communities: 8 };

const byDegree = (a: Entity, b: Entity) => b.degree - a.degree || a.title.localeCompare(b.title);

/**
 * The rows GraphRAG's local search would rank for the scope, in its order: entities by degree,
 * relationships in-network before out-network by combined degree, text units by how many scoped
 * entities and relationships they carry, communities by rank.
 */
export function contextFor(dataset: Dataset, partition: Partition | null, scope: ContextScope, limits: ContextLimits = DEFAULT_LIMITS): ContextTables {
  let scoped: Entity[];
  if (scope.kind === "community") {
    const community = partition?.communities.get(scope.id);
    scoped = (community?.entityIds ?? []).map((id) => dataset.entities.get(id)).filter((e): e is Entity => e !== undefined);
  } else if (scope.kind === "entity") {
    const seed = dataset.entities.get(scope.id);
    const ids = new Set<string>();
    if (seed) {
      ids.add(seed.id);
      for (const r of dataset.relationships) {
        if (r.sourceId === seed.id) ids.add(r.targetId);
        if (r.targetId === seed.id) ids.add(r.sourceId);
      }
    }
    scoped = [...ids].map((id) => dataset.entities.get(id)!).filter(Boolean);
    if (seed) scoped = [seed, ...scoped.filter((e) => e.id !== seed.id).sort(byDegree)];
  } else {
    scoped = [...dataset.entities.values()].sort(byDegree).slice(0, limits.entities);
  }
  if (scope.kind !== "entity") scoped.sort(byDegree);
  const scopedIds = new Set(scoped.map((e) => e.id));

  const relationships: RelationshipRow[] = [];
  for (const relationship of dataset.relationships) {
    const inside = Number(scopedIds.has(relationship.sourceId)) + Number(scopedIds.has(relationship.targetId));
    if (inside === 0) continue;
    const combinedDegree = (dataset.entities.get(relationship.sourceId)?.degree ?? 0) + (dataset.entities.get(relationship.targetId)?.degree ?? 0);
    relationships.push({ relationship, network: inside === 2 ? "in" : "out", combinedDegree, links: relationship.textUnitIds.length });
  }
  const order = (a: RelationshipRow, b: RelationshipRow) => b.combinedDegree - a.combinedDegree || b.links - a.links || a.relationship.id.localeCompare(b.relationship.id);
  const inNetwork = relationships.filter((r) => r.network === "in").sort(order).slice(0, limits.inNetwork);
  const outNetwork = relationships.filter((r) => r.network === "out").sort(order).slice(0, limits.outNetwork);
  const scopedRelationshipIds = new Set([...inNetwork, ...outNetwork].map((r) => r.relationship.id));

  // Text units name their entities (GraphRAG >= 1.0) or entities name their units (older); count both directions once.
  const entityHits = new Map<string, Set<string>>();
  const relationshipHits = new Map<string, Set<string>>();
  const hit = (index: Map<string, Set<string>>, unitId: string, id: string) => {
    const set = index.get(unitId) ?? new Set<string>();
    set.add(id);
    index.set(unitId, set);
  };
  for (const entity of scoped) for (const unitId of entity.textUnitIds) hit(entityHits, unitId, entity.id);
  for (const row of [...inNetwork, ...outNetwork]) for (const unitId of row.relationship.textUnitIds) hit(relationshipHits, unitId, row.relationship.id);
  for (const unit of dataset.textUnits.values()) {
    for (const id of unit.entityIds) if (scopedIds.has(id)) hit(entityHits, unit.id, id);
    for (const id of unit.relationshipIds) if (scopedRelationshipIds.has(id)) hit(relationshipHits, unit.id, id);
  }
  const textUnits: TextUnitRow[] = [];
  for (const unit of dataset.textUnits.values()) {
    const e = entityHits.get(unit.id)?.size ?? 0;
    const r = relationshipHits.get(unit.id)?.size ?? 0;
    if (e + r > 0) textUnits.push({ unit, entityHits: e, relationshipHits: r });
  }
  textUnits.sort((a, b) => b.entityHits - a.entityHits || b.relationshipHits - a.relationshipHits || a.unit.id.localeCompare(b.unit.id));

  let communities: CommunityRow[] = [];
  if (partition) {
    const matches = (c: Community) => c.entityIds.filter((id) => scopedIds.has(id)).length;
    const row = (c: Community): CommunityRow => ({ community: c, matches: matches(c), rank: c.report?.rank });
    if (scope.kind === "community") {
      const self = partition.communities.get(scope.id);
      const trail = self ? pathTo(partition, self.id) : [];
      const children = (self?.childIds ?? []).map((id) => partition.communities.get(id)).filter((c): c is Community => c !== undefined);
      communities = [...trail, ...children].map(row);
    } else if (scope.kind === "entity") {
      const index = membershipIndex(partition);
      communities = (index.get(scope.id) ?? []).slice().sort((a, b) => b.level - a.level).map(row);
    } else {
      communities = [...partition.communities.values()]
        .map(row)
        .sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1) || b.matches - a.matches || b.community.size - a.community.size)
        .slice(0, limits.communities);
    }
  }

  return {
    scope,
    scoped,
    communities,
    entities: scoped.slice(0, limits.entities).map((entity) => ({ entity })),
    relationships: [...inNetwork, ...outNetwork],
    textUnits: textUnits.slice(0, limits.textUnits),
  };
}
