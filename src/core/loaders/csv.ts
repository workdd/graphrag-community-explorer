// A graph from two CSV files, or from one.
//
// GraphRAG's Parquet is one way a graph arrives and not the common one. Most people who have a
// graph have it as a node table and an edge table, exported from a database, a spreadsheet or a
// script. Nothing about the schema view, the community structure, the health findings or the
// layouts needs GraphRAG; only the reports, the source text and the vectors do.
//
// Column names are guessed, because nobody agrees on them and asking would be worse. What was
// guessed is reported, so a wrong guess is visible rather than silent.

/**
 * Splits CSV text into rows of fields.
 *
 * Quoted fields may contain commas, newlines and doubled quotes, which is the whole reason this is
 * not a call to `split`. A file that opens a quote and never closes it ends at the end of the file
 * rather than throwing: a truncated export should still show what it has.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = true;
  };
  const endRow = () => {
    endField();
    // A trailing newline must not produce a row of one empty field.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    started = false;
  };

  const body = text.replace(/^﻿/, ""); // a spreadsheet export often starts with a byte-order mark
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (body[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (quoted || field !== "" || started || row.length > 0) endRow();
  return rows;
}

const clean = (name: string): string => name.trim().toLowerCase().replace(/[\s_-]+/g, "");

/** The first header that matches, by the names people actually use. */
export function pickColumn(headers: string[], names: string[]): number {
  const cleaned = headers.map(clean);
  for (const name of names) {
    const at = cleaned.indexOf(clean(name));
    if (at !== -1) return at;
  }
  return -1;
}

export const NODE_COLUMNS = {
  id: ["id", "node", "nodeid", "name", "key", "identifier"],
  title: ["title", "label", "name", "display", "displayname"],
  type: ["type", "category", "kind", "group", "class", "labels"],
  description: ["description", "desc", "summary", "text", "detail", "notes"],
};

export const EDGE_COLUMNS = {
  source: ["source", "src", "from", "start", "subject", "node1", "u"],
  target: ["target", "dst", "to", "end", "object", "node2", "v"],
  type: ["type", "label", "relation", "relationship", "predicate", "kind", "edgetype"],
  weight: ["weight", "value", "count", "strength", "score"],
  description: ["description", "desc", "summary", "text", "detail", "notes"],
};

export interface ColumnChoice {
  /** Header index per field, -1 when the file has none. */
  at: Record<string, number>;
  /** Header name per field that was matched, for saying what was guessed. */
  named: Record<string, string>;
}

export function chooseColumns(headers: string[], columns: Record<string, string[]>): ColumnChoice {
  const at: Record<string, number> = {};
  const named: Record<string, string> = {};
  for (const [field, names] of Object.entries(columns)) {
    const index = pickColumn(headers, names);
    at[field] = index;
    if (index !== -1) named[field] = headers[index].trim();
  }
  return { at, named };
}

export interface CsvNode {
  id: string;
  title: string;
  type: string;
  description?: string;
}

export interface CsvEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
  description?: string;
}

export interface CsvRead<T> {
  rows: T[];
  named: Record<string, string>;
  /** Rows dropped because the columns that identify a record were empty. */
  skipped: number;
}

const cell = (row: string[], at: number): string => (at === -1 ? "" : (row[at] ?? "").trim());

/** The type given to a record whose file does not say. One type is still a schema. */
export const UNTYPED = "node";
export const UNTYPED_EDGE = "linked";

export function readNodeCsv(text: string): CsvRead<CsvNode> {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], named: {}, skipped: 0 };
  const [headers, ...body] = table;
  const { at, named } = chooseColumns(headers, NODE_COLUMNS);
  // A file with no recognisable id column still has a first column, and that is almost always it.
  const idAt = at.id === -1 ? 0 : at.id;
  const rows: CsvNode[] = [];
  let skipped = 0;
  for (const row of body) {
    const id = cell(row, idAt);
    if (id === "") {
      skipped += 1;
      continue;
    }
    const title = cell(row, at.title) || id;
    const description = cell(row, at.description);
    rows.push({
      id,
      title,
      type: cell(row, at.type) || UNTYPED,
      ...(description === "" ? {} : { description }),
    });
  }
  return { rows, named: { ...named, id: named.id ?? headers[idAt]?.trim() ?? "" }, skipped };
}

export function readEdgeCsv(text: string): CsvRead<CsvEdge> {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], named: {}, skipped: 0 };
  const [headers, ...body] = table;
  const { at, named } = chooseColumns(headers, EDGE_COLUMNS);
  // An edge list with no header names is the first two columns, which is what every such file is.
  const sourceAt = at.source === -1 ? 0 : at.source;
  const targetAt = at.target === -1 ? 1 : at.target;
  const rows: CsvEdge[] = [];
  let skipped = 0;
  for (const row of body) {
    const source = cell(row, sourceAt);
    const target = cell(row, targetAt);
    if (source === "" || target === "") {
      skipped += 1;
      continue;
    }
    const weight = Number(cell(row, at.weight));
    const description = cell(row, at.description);
    rows.push({
      source,
      target,
      type: cell(row, at.type) || UNTYPED_EDGE,
      ...(Number.isFinite(weight) && cell(row, at.weight) !== "" ? { weight } : {}),
      ...(description === "" ? {} : { description }),
    });
  }
  return {
    rows,
    named: {
      ...named,
      source: named.source ?? headers[sourceAt]?.trim() ?? "",
      target: named.target ?? headers[targetAt]?.trim() ?? "",
    },
    skipped,
  };
}
