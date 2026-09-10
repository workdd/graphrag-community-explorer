// A dataset from a node table and an edge table.
//
// Everything the schema view, the layouts, the community work and the health findings need is an
// entity list and a relationship list. The rest of the contract, which is GraphRAG's, is optional
// and stays empty here: no reports, no source text, no claims, no vectors.
import { readEdgeCsv, readNodeCsv, UNTYPED } from "./csv";
import type { Dataset, Entity, Relationship } from "../model";

export interface CsvSource {
  /** The node table, when the folder has one. Endpoints define the nodes when it does not. */
  nodes?: string;
  edges: string;
}

export interface CsvDataset {
  dataset: Dataset;
  /** What was guessed and what was dropped, so neither is silent. */
  notes: string[];
}

export function buildCsvDataset(source: CsvSource): CsvDataset {
  const notes: string[] = [];
  const edgeTable = readEdgeCsv(source.edges);
  const nodeTable = source.nodes === undefined ? null : readNodeCsv(source.nodes);

  const entities = new Map<string, Entity>();
  if (nodeTable) {
    for (const node of nodeTable.rows) {
      // A repeated id is one node named twice, not two nodes.
      if (!entities.has(node.id)) {
        entities.set(node.id, { ...node, degree: 0, textUnitIds: [] });
      }
    }
    if (nodeTable.rows.length > entities.size) {
      notes.push(`${nodeTable.rows.length - entities.size} node rows repeated an id and were merged.`);
    }
    if (nodeTable.skipped > 0) notes.push(`${nodeTable.skipped} node rows had no id and were skipped.`);
    notes.push(named("Nodes", nodeTable.named));
  }

  const relationships: Relationship[] = [];
  let dangling = 0;
  edgeTable.rows.forEach((edge, index) => {
    if (nodeTable) {
      // With a node table, an end nobody declared is a hole in the export and is worth counting.
      if (!entities.has(edge.source) || !entities.has(edge.target)) {
        dangling += 1;
        return;
      }
    } else {
      for (const id of [edge.source, edge.target]) {
        if (!entities.has(id)) entities.set(id, { id, title: id, type: UNTYPED, degree: 0, textUnitIds: [] });
      }
    }
    relationships.push({
      id: `e${index + 1}`,
      sourceId: edge.source,
      targetId: edge.target,
      type: edge.type,
      ...(edge.weight === undefined ? {} : { weight: edge.weight }),
      ...(edge.description === undefined ? {} : { description: edge.description }),
      textUnitIds: [],
    });
  });

  for (const relationship of relationships) {
    const a = entities.get(relationship.sourceId);
    const b = entities.get(relationship.targetId);
    if (a) a.degree += 1;
    if (b && b !== a) b.degree += 1;
  }

  if (dangling > 0) notes.push(`${dangling} edges named a node the node table does not have and were dropped.`);
  if (edgeTable.skipped > 0) notes.push(`${edgeTable.skipped} edge rows were missing an end and were skipped.`);
  notes.push(named("Edges", edgeTable.named));
  if (!nodeTable) notes.push("No node table, so the nodes are the ends of the edges.");

  return {
    dataset: {
      source: { kind: "csv", files: [] },
      entities,
      relationships,
      partitions: [],
      textUnits: new Map(),
      documents: new Map(),
      covariates: [],
    },
    notes: notes.filter((note) => note !== ""),
  };
}

/** Which header was read as what, because a guess nobody can see is a guess nobody can correct. */
function named(table: string, columns: Record<string, string>): string {
  const parts = Object.entries(columns)
    .filter(([, header]) => header !== "")
    .map(([field, header]) => `${field} from "${header}"`);
  return parts.length === 0 ? "" : `${table}: ${parts.join(", ")}.`;
}
