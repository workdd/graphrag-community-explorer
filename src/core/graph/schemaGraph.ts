// The schema of an index read back from the data itself: entity types as nodes, and one edge per
// (source type, relationship type, target type) that actually occurs. Nothing is declared anywhere,
// so this is the only description of the shape a GraphRAG index has.
import type { Dataset, Entity, Relationship } from "../model";

export interface SchemaTypeNode {
  type: string;
  entities: number;
  /** Relationships with at least one end on this type. */
  relationships: number;
}

export interface SchemaTripleEdge {
  id: string;
  from: string;
  to: string;
  relationship: string;
  count: number;
  /** Both ends are the same type, which the layered arrangement cannot show as a step forward. */
  loop: boolean;
  /** Pairs of entities this triple could possibly connect. */
  possible: number;
  /** count / possible. Near one means every pair is joined, and no shape is left to draw. */
  density: number;
}

/**
 * Above this share of its possible pairs a triple is a block, not a shape: arrows give a hairball
 * whatever the layout, and a matrix is the only readable form.
 */
export const DENSE = 0.2;

export const isDense = (edge: SchemaTripleEdge): boolean => edge.density >= DENSE && edge.count >= 50;

export interface SchemaGraph {
  nodes: SchemaTypeNode[];
  edges: SchemaTripleEdge[];
  /** Relationships whose endpoints are missing from the entity table; they are in no triple. */
  dangling: number;
}

export const tripleId = (from: string, relationship: string, to: string) => `${from}|${relationship}|${to}`;

/** Entity types and the relationship triples between them, both with counts, most used first. */
export function schemaGraph(dataset: Dataset): SchemaGraph {
  const entities = new Map<string, number>();
  for (const entity of dataset.entities.values()) entities.set(entity.type, (entities.get(entity.type) ?? 0) + 1);
  const triples = new Map<string, SchemaTripleEdge>();
  const touching = new Map<string, number>();
  let dangling = 0;
  for (const relationship of dataset.relationships) {
    const from = dataset.entities.get(relationship.sourceId)?.type;
    const to = dataset.entities.get(relationship.targetId)?.type;
    if (from === undefined || to === undefined) {
      dangling += 1;
      continue;
    }
    const id = tripleId(from, relationship.type, to);
    const edge = triples.get(id);
    if (edge) edge.count += 1;
    else triples.set(id, { id, from, to, relationship: relationship.type, count: 1, loop: from === to, possible: 0, density: 0 });
    touching.set(from, (touching.get(from) ?? 0) + 1);
    if (to !== from) touching.set(to, (touching.get(to) ?? 0) + 1);
  }
  // Density needs the type sizes, so it is filled in once every triple has been counted.
  for (const edge of triples.values()) {
    const a = entities.get(edge.from) ?? 0;
    const b = entities.get(edge.to) ?? 0;
    edge.possible = edge.loop ? (a * (a - 1)) / 2 : a * b;
    edge.density = edge.possible > 0 ? edge.count / edge.possible : 0;
  }
  return {
    nodes: [...entities.entries()]
      .map(([type, count]) => ({ type, entities: count, relationships: touching.get(type) ?? 0 }))
      .sort((a, b) => b.entities - a.entities || a.type.localeCompare(b.type)),
    edges: [...triples.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    dangling,
  };
}

/** Types reachable in one step from a type, itself included: what to draw to see it in context. */
export function neighbourTypes(graph: SchemaGraph, type: string): string[] {
  const out = new Set([type]);
  for (const edge of graph.edges) {
    if (edge.from === type) out.add(edge.to);
    if (edge.to === type) out.add(edge.from);
  }
  return [...out];
}

/** Relationship type names that touch a type. */
export function relationshipsOfType(graph: SchemaGraph, type: string): string[] {
  const out = new Set<string>();
  for (const edge of graph.edges) if (edge.from === type || edge.to === type) out.add(edge.relationship);
  return [...out];
}

export interface TripleSample {
  relationship: Relationship;
  source: Entity;
  target: Entity;
}

/** Real rows behind a triple, so a schema edge can be read as the values it stands for. */
export function samplesForTriple(dataset: Dataset, edge: SchemaTripleEdge, limit = 8): TripleSample[] {
  const out: TripleSample[] = [];
  for (const relationship of dataset.relationships) {
    if (relationship.type !== edge.relationship) continue;
    const source = dataset.entities.get(relationship.sourceId);
    const target = dataset.entities.get(relationship.targetId);
    if (!source || !target || source.type !== edge.from || target.type !== edge.to) continue;
    out.push({ relationship, source, target });
    if (out.length >= limit) break;
  }
  return out;
}

/** The busiest entities of a type, which is what a reader wants to see first. */
export function samplesForType(dataset: Dataset, type: string, limit = 8): Entity[] {
  return [...dataset.entities.values()]
    .filter((entity) => entity.type === type)
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** A slice of the schema carried into the data views. */
export interface SchemaSelection {
  label: string;
  types: string[];
  relationships: string[];
}

/** One type with everything it touches, which is the smallest slice that still shows relationships. */
export function selectType(graph: SchemaGraph, type: string): SchemaSelection {
  return { label: type, types: neighbourTypes(graph, type), relationships: relationshipsOfType(graph, type) };
}

/** One triple on its own: two types and the single relationship between them. */
export function selectTriple(edge: SchemaTripleEdge): SchemaSelection {
  return { label: `${edge.from} ${edge.relationship} ${edge.to}`, types: [...new Set([edge.from, edge.to])], relationships: [edge.relationship] };
}

/** Follows one more schema arrow out of the current slice, which is how a reader walks the schema. */
export function extendSelection(selection: SchemaSelection, edge: SchemaTripleEdge): SchemaSelection {
  const types = [...new Set([...selection.types, edge.from, edge.to])];
  const relationships = [...new Set([...selection.relationships, edge.relationship])];
  return { label: `${selection.label} + ${edge.relationship}`, types, relationships };
}

/** Schema arrows that leave the slice, so a reader can see where there is more to go. */
export function exitsFrom(graph: SchemaGraph, selection: SchemaSelection): SchemaTripleEdge[] {
  const inside = new Set(selection.types);
  return graph.edges.filter((edge) => {
    const from = inside.has(edge.from);
    const to = inside.has(edge.to);
    if (from === to) return from && !selection.relationships.includes(edge.relationship);
    return true;
  });
}
