import type { EmbeddingIndex } from "./embeddings";
import type { TableInfo } from "../schema";
import type {
  Community,
  CommunityReport,
  Covariate,
  Dataset,
  Document,
  Entity,
  Finding,
  MembershipSource,
  Partition,
  Relationship,
  SourceKind,
  TextUnit,
} from "../model";
import type { Row } from "./parquet";

export interface Tables {
  entities: Row[];
  relationships: Row[];
  communities?: Row[];
  community_reports?: Row[];
  text_units?: Row[];
  documents?: Row[];
  covariates?: Row[];
  /** Additional community sets keyed by label, e.g. "leiden" from leiden_communities.parquet. */
  extraPartitions?: Record<string, Row[]>;
}

/** Row-level problems found while normalizing. Structural checks live in metrics/integrity. */
export interface LoaderNote {
  kind: string;
  label: string;
  count: number;
  samples: string[];
}

export interface LoadResult {
  dataset: Dataset;
  notes: LoaderNote[];
  /** Raw tables as loaded: name, row count, column names. The schema view reads these. */
  tables: TableInfo[];
  /** File name to sha256 of the bytes that were read. Search traces name the same digests. */
  fingerprints?: Record<string, string>;
  /** Entity vectors from an embeddings.parquet dropped alongside the index, when one was. */
  embeddings?: EmbeddingIndex;
  /** Why an embeddings file that was present is not usable. */
  embeddingsNote?: string;
}

export const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "bigint" || typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
};

export const num = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
};

export const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((x): x is string => x !== undefined) : [];

class Notes {
  private byKind = new Map<string, LoaderNote>();
  add(kind: string, label: string, sample?: string) {
    const note = this.byKind.get(kind) ?? { kind, label, count: 0, samples: [] };
    note.count += 1;
    if (sample !== undefined && note.samples.length < 5) note.samples.push(sample);
    this.byKind.set(kind, note);
  }
  toArray(): LoaderNote[] {
    return [...this.byKind.values()];
  }
}

const parseFindings = (raw: unknown): Finding[] => {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((f) => {
    const row = (f ?? {}) as Row;
    return { summary: str(row.summary) ?? "", explanation: str(row.explanation) ?? "" };
  });
};

const mode = (values: number[]): number => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};

function buildPartition(
  id: string,
  label: string,
  rows: Row[],
  reportRows: Row[],
  relationships: Relationship[],
  entities: Map<string, Entity>,
  notes: Notes,
): Partition {
  const relById = new Map(relationships.map((r) => [r.id, r]));
  const reports = new Map<string, CommunityReport>();
  for (const row of reportRows) {
    const key = str(row.community) ?? str(row.human_readable_id);
    if (key === undefined) continue;
    reports.set(key, {
      summary: str(row.summary) ?? "",
      fullContent: str(row.full_content),
      findings: parseFindings(row.findings),
      rank: num(row.rank),
      rankExplanation: str(row.rank_explanation) ?? str(row.rating_explanation),
    });
  }

  // GraphRAG numbers communities uniquely across levels and references parents by number. Other
  // producers restart numbers per level and reference parents by row id, so the key falls back to
  // the row id when numbers collide, and parent references resolve through both.
  const numberOf = (row: Row) => str(row.community) ?? str(row.human_readable_id);
  const numbers = rows.map(numberOf).filter((n): n is string => n !== undefined);
  const numbersUnique = new Set(numbers).size === numbers.length;
  const keyOf = (row: Row, index: number): string => {
    const number = numberOf(row);
    if (numbersUnique && number !== undefined) return number;
    return str(row.id) ?? number ?? `community-${index}`;
  };
  const keyByNumber = new Map<string, string>();
  const keyById = new Map<string, string>();
  rows.forEach((row, index) => {
    const key = keyOf(row, index);
    const number = numberOf(row);
    const rowId = str(row.id);
    if (numbersUnique && number !== undefined) keyByNumber.set(number, key);
    if (rowId !== undefined && !keyById.has(rowId)) keyById.set(rowId, key);
  });
  const resolveRef = (ref: unknown): string | null => {
    const value = str(ref);
    if (value === undefined) return null;
    const asNumber = num(ref);
    if (asNumber !== undefined && asNumber < 0) return null;
    return keyByNumber.get(value) ?? keyById.get(value) ?? value;
  };

  const communities = new Map<string, Community>();
  rows.forEach((row, index) => {
    const number = keyOf(row, index);
    if (communities.has(number)) {
      notes.add("duplicate-community-id", "Communities share an id; later rows were skipped", number);
      return;
    }
    const uuid = str(row.id);
    const relationshipIds = list(row.relationship_ids);
    let membershipSource: MembershipSource = "entity_ids";
    let entityIds = list(row.entity_ids);
    if (entityIds.length === 0 && relationshipIds.length > 0) {
      // GraphRAG <= 0.3 has no entity_ids column; members are the endpoints of the internal relationships.
      const inferred = new Set<string>();
      for (const rid of relationshipIds) {
        const rel = relById.get(rid);
        if (rel) inferred.add(rel.sourceId).add(rel.targetId);
      }
      entityIds = [...inferred];
      membershipSource = "relationship_ids";
    }
    const known = entityIds.filter((eid) => {
      if (entities.has(eid)) return true;
      notes.add("missing-member", "Community members that match no entity were dropped", `${str(row.title) ?? number}: ${eid}`);
      return false;
    });
    communities.set(number, {
      id: number,
      uuid: uuid !== undefined && uuid !== number ? uuid : undefined,
      level: num(row.level) ?? 0,
      parentId: resolveRef(row.parent),
      childIds: [],
      title: str(row.title) ?? `Community ${number}`,
      entityIds: [...new Set(known)],
      relationshipIds,
      size: num(row.size) ?? known.length,
      membershipSource,
      report: reports.get(numberOf(row) ?? number),
      textUnitIds: list(row.text_unit_ids),
    });
  });

  // Parents are the source of truth for the tree; children lists are derived so the two never disagree.
  for (const community of communities.values()) {
    if (community.parentId !== null) communities.get(community.parentId)?.childIds.push(community.id);
  }
  const levels = [...new Set([...communities.values()].map((c) => c.level))].sort((a, b) => a - b);
  const roots = [...communities.values()].filter((c) => c.parentId === null || !communities.has(c.parentId));
  const rootLevel = roots.length > 0 ? mode(roots.map((c) => c.level)) : (levels[0] ?? 0);
  return { id, label, communities, levels, rootLevel };
}

export function buildDataset(tables: Tables, files: string[]): LoadResult {
  const notes = new Notes();
  const entities = new Map<string, Entity>();
  const idByTitle = new Map<string, string>();

  tables.entities.forEach((row, index) => {
    const id = str(row.id) ?? `entity-${index}`;
    const title = str(row.title) ?? str(row.name) ?? id;
    if (entities.has(id)) {
      notes.add("duplicate-entity-id", "Entities share an id; later rows were skipped", id);
      return;
    }
    if (idByTitle.has(title)) {
      notes.add("duplicate-entity-title", "Entities share a title; relationships resolve to the first one", title);
    } else {
      idByTitle.set(title, id);
    }
    entities.set(id, {
      id,
      title,
      type: str(row.type) ?? "unknown",
      description: str(row.description),
      degree: 0,
      textUnitIds: list(row.text_unit_ids),
    });
  });

  // GraphRAG relationships reference entities by title; some exports use ids. Accept both.
  const resolve = (ref: string | undefined): string | undefined => {
    if (ref === undefined) return undefined;
    return idByTitle.get(ref) ?? (entities.has(ref) ? ref : undefined);
  };
  const relationships: Relationship[] = [];
  const seenIds = new Set<string>();
  tables.relationships.forEach((row, index) => {
    const source = str(row.source);
    const target = str(row.target);
    const sourceId = resolve(source);
    const targetId = resolve(target);
    if (sourceId === undefined || targetId === undefined) {
      notes.add("dangling-relationship", "Relationships whose endpoints match no entity were skipped", `${source ?? "?"} -> ${target ?? "?"}`);
      return;
    }
    let id = str(row.id) ?? `relationship-${index}`;
    if (seenIds.has(id)) id = `${id}#${index}`;
    seenIds.add(id);
    relationships.push({
      id,
      sourceId,
      targetId,
      type: str(row.type) ?? "related",
      weight: num(row.weight),
      description: str(row.description),
      textUnitIds: list(row.text_unit_ids),
    });
    entities.get(sourceId)!.degree += 1;
    entities.get(targetId)!.degree += 1;
  });

  const partitions: Partition[] = [];
  if (tables.communities) {
    partitions.push(buildPartition("communities", "Communities", tables.communities, tables.community_reports ?? [], relationships, entities, notes));
  }
  for (const [label, rows] of Object.entries(tables.extraPartitions ?? {})) {
    partitions.push(buildPartition(label, label, rows, [], relationships, entities, notes));
  }

  const textUnits = new Map<string, TextUnit>();
  (tables.text_units ?? []).forEach((row, index) => {
    const id = str(row.id) ?? `text-unit-${index}`;
    textUnits.set(id, {
      id,
      text: str(row.text) ?? "",
      documentIds: list(row.document_ids),
      entityIds: list(row.entity_ids),
      relationshipIds: list(row.relationship_ids),
      tokens: num(row.n_tokens),
    });
  });
  const documents = new Map<string, Document>();
  (tables.documents ?? []).forEach((row, index) => {
    const id = str(row.id) ?? `document-${index}`;
    documents.set(id, { id, title: str(row.title) ?? id, text: str(row.text) });
  });

  const covariates: Covariate[] = (tables.covariates ?? []).map((row, index) => {
    const subjectTitle = str(row.subject_id) ?? "";
    const objectTitle = str(row.object_id);
    const source = row.source_text;
    return {
      id: str(row.id) ?? `covariate-${index}`,
      type: str(row.type) ?? str(row.covariate_type) ?? "claim",
      description: str(row.description) ?? "",
      subjectId: resolve(subjectTitle),
      subjectTitle,
      objectId: resolve(objectTitle),
      objectTitle,
      status: str(row.status),
      startDate: str(row.start_date),
      endDate: str(row.end_date),
      sourceText: Array.isArray(source) ? list(source).join(" ") : str(source),
      textUnitId: str(row.text_unit_id),
    };
  });

  const kind: SourceKind = tables.entities.some((row) => "age_properties_json" in row) ? "age-export" : "graphrag";
  const info = (name: string, rows: Row[] | undefined): TableInfo[] => (rows ? [{ name, rows: rows.length, columns: rows.length > 0 ? Object.keys(rows[0]) : [] }] : []);
  const tableInfos: TableInfo[] = [
    ...info("entities", tables.entities),
    ...info("relationships", tables.relationships),
    ...info("communities", tables.communities),
    ...info("community_reports", tables.community_reports),
    ...info("text_units", tables.text_units),
    ...info("documents", tables.documents),
    ...info("covariates", tables.covariates),
    ...Object.entries(tables.extraPartitions ?? {}).flatMap(([label, rows]) => info(`${label}_communities`, rows)),
  ];
  return { dataset: { source: { kind, files }, entities, relationships, partitions, textUnits, documents, covariates }, notes: notes.toArray(), tables: tableInfos };
}
