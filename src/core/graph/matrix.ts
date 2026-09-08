// Two readings of a relationship triple that a node-link drawing cannot give: the matrix of which
// pairs are connected, and the grouping of how many hang off each endpoint. Both are what a dense
// or star-shaped triple actually looks like.
import type { Dataset, Entity } from "../model";
import type { SchemaTripleEdge } from "./schemaGraph";

export interface MatrixModel {
  from: string;
  to: string;
  /** Relationship names in legend order; a cell's bits index into this. */
  relationships: string[];
  rows: Entity[];
  cols: Entity[];
  /** Entities on each side that take part, before the row and column limits. */
  rowsTotal: number;
  colsTotal: number;
  /** row * cols.length + col, to the bits of the relationships present. */
  cells: Map<number, number>;
  /** Connected pairs drawn. */
  pairs: number;
}

export interface MatrixLimits {
  rows: number;
  cols: number;
}

export const DEFAULT_MATRIX_LIMITS: MatrixLimits = { rows: 80, cols: 260 };

/**
 * The pairs between two entity types under the given relationship names. Rows and columns are the
 * entities that take part, busiest first, so the corner of the matrix carries the most information.
 */
export function buildMatrix(
  dataset: Dataset,
  from: string,
  to: string,
  relationships: string[],
  limits: MatrixLimits = DEFAULT_MATRIX_LIMITS,
): MatrixModel {
  const names = [...new Set(relationships)];
  const bit = new Map(names.map((name, i) => [name, 1 << i]));
  const pairs = new Map<string, Map<string, number>>();
  const rowCount = new Map<string, number>();
  const colCount = new Map<string, number>();
  for (const relationship of dataset.relationships) {
    const mask = bit.get(relationship.type);
    if (mask === undefined) continue;
    const source = dataset.entities.get(relationship.sourceId);
    const target = dataset.entities.get(relationship.targetId);
    if (!source || !target || source.type !== from || target.type !== to) continue;
    let row = pairs.get(source.id);
    if (!row) {
      row = new Map<string, number>();
      pairs.set(source.id, row);
    }
    const before = row.get(target.id) ?? 0;
    if (before === 0) {
      rowCount.set(source.id, (rowCount.get(source.id) ?? 0) + 1);
      colCount.set(target.id, (colCount.get(target.id) ?? 0) + 1);
    }
    row.set(target.id, before | mask);
  }
  const pick = (counts: Map<string, number>, limit: number) =>
    [...counts.entries()]
      .map(([id, count]) => ({ entity: dataset.entities.get(id), count }))
      .filter((row): row is { entity: Entity; count: number } => row.entity !== undefined)
      .sort((a, b) => b.count - a.count || a.entity.title.localeCompare(b.entity.title))
      .slice(0, limit)
      .map((row) => row.entity);
  const rows = pick(rowCount, limits.rows);
  const cols = pick(colCount, limits.cols);
  const colIndex = new Map(cols.map((entity, i) => [entity.id, i]));
  const cells = new Map<number, number>();
  rows.forEach((source, r) => {
    const row = pairs.get(source.id);
    if (!row) return;
    for (const [targetId, mask] of row) {
      const c = colIndex.get(targetId);
      if (c === undefined) continue;
      cells.set(r * cols.length + c, mask);
    }
  });
  return { from, to, relationships: names, rows, cols, rowsTotal: rowCount.size, colsTotal: colCount.size, cells, pairs: cells.size };
}

export interface GroupCount {
  entity: Entity;
  count: number;
}

export interface TripleGrouping {
  /** Which end the counting is done on. */
  by: "source" | "target";
  groups: GroupCount[];
  distinct: number;
  /** Mean relationships per group, which is how star-shaped the triple is. */
  fanOut: number;
}

/**
 * A star-shaped triple reads better as a list of how many hang off each hub than as arrows, so this
 * counts on whichever end has fewer distinct entities.
 */
export function groupsForTriple(dataset: Dataset, edge: SchemaTripleEdge, limit = 12): TripleGrouping {
  const sources = new Map<string, number>();
  const targets = new Map<string, number>();
  for (const relationship of dataset.relationships) {
    if (relationship.type !== edge.relationship) continue;
    const source = dataset.entities.get(relationship.sourceId);
    const target = dataset.entities.get(relationship.targetId);
    if (!source || !target || source.type !== edge.from || target.type !== edge.to) continue;
    sources.set(source.id, (sources.get(source.id) ?? 0) + 1);
    targets.set(target.id, (targets.get(target.id) ?? 0) + 1);
  }
  const by: "source" | "target" = targets.size <= sources.size ? "target" : "source";
  const counts = by === "target" ? targets : sources;
  const groups = [...counts.entries()]
    .map(([id, count]) => ({ entity: dataset.entities.get(id), count }))
    .filter((group): group is GroupCount => group.entity !== undefined)
    .sort((a, b) => b.count - a.count || a.entity.title.localeCompare(b.entity.title));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { by, groups: groups.slice(0, limit), distinct: counts.size, fanOut: counts.size === 0 ? 0 : total / counts.size };
}
