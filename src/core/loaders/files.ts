import { sha256 } from "../search/fingerprint";
import { readEmbeddings } from "./embeddings";
import { buildDataset, type LoadResult, type Tables } from "./graphrag";
import { readParquet, type Row } from "./parquet";

export type TableName = "entities" | "relationships" | "communities" | "community_reports" | "text_units" | "documents" | "covariates";

/** GraphRAG >= 1.0 names first, then the create_final_* names of 0.3 to 0.5. */
export const CANONICAL_FILES: Record<TableName, string[]> = {
  entities: ["entities.parquet", "create_final_entities.parquet"],
  relationships: ["relationships.parquet", "create_final_relationships.parquet"],
  communities: ["communities.parquet", "create_final_communities.parquet"],
  community_reports: ["community_reports.parquet", "create_final_community_reports.parquet"],
  text_units: ["text_units.parquet", "create_final_text_units.parquet"],
  documents: ["documents.parquet", "create_final_documents.parquet"],
  covariates: ["covariates.parquet", "create_final_covariates.parquet"],
};

export const EMBEDDINGS_FILE = "embeddings.parquet";

export type FileRole = { table: TableName } | { partition: string } | { embeddings: true } | null;

export function classifyFile(name: string): FileRole {
  const base = name.split("/").pop()!.toLowerCase();
  if (base === EMBEDDINGS_FILE) return { embeddings: true };
  for (const [table, names] of Object.entries(CANONICAL_FILES)) {
    if (names.includes(base)) return { table: table as TableName };
  }
  const extra = /^(.+)_communities\.parquet$/.exec(base);
  if (extra && extra[1] !== "create_final") return { partition: extra[1] };
  return null;
}

interface Loaded {
  name: string;
  role: FileRole;
  buffer: ArrayBuffer;
}

async function assemble(files: Loaded[]): Promise<LoadResult> {
  const tables: Partial<Record<TableName, Row[]>> = {};
  const extraPartitions: Record<string, Row[]> = {};
  const used: string[] = [];
  const fingerprints: Record<string, string> = {};
  let embeddings: LoadResult["embeddings"];
  let embeddingsNote: string | undefined;
  for (const file of files) {
    if (!file.role) continue;
    const base = file.name.split("/").pop()!;
    fingerprints[base] = await sha256(file.buffer);
    if ("embeddings" in file.role) {
      // A broken sidecar disables local search; it never stops the index itself from opening.
      try {
        const load = await readEmbeddings(file.buffer);
        embeddings = load.index;
        if (load.notes.length > 0) embeddingsNote = load.notes.join(" ");
      } catch (error) {
        embeddingsNote = error instanceof Error ? error.message : String(error);
      }
      used.push(base);
      continue;
    }
    const rows = await readParquet(file.buffer);
    if ("table" in file.role) {
      if (tables[file.role.table]) continue; // first match wins (new name before create_final_*)
      tables[file.role.table] = rows;
    } else {
      extraPartitions[file.role.partition] = rows;
    }
    used.push(base);
  }
  if (!tables.entities || !tables.relationships) {
    const found = used.length ? used.join(", ") : "none";
    throw new Error(`Need entities.parquet and relationships.parquet. Recognized files: ${found}.`);
  }
  const input: Tables = {
    entities: tables.entities,
    relationships: tables.relationships,
    communities: tables.communities,
    community_reports: tables.community_reports,
    text_units: tables.text_units,
    documents: tables.documents,
    covariates: tables.covariates,
    extraPartitions,
  };
  return { ...buildDataset(input, used), fingerprints, embeddings, embeddingsNote };
}

export async function loadFromFiles(files: File[]): Promise<LoadResult> {
  const loaded = await Promise.all(
    files
      .filter((f) => classifyFile(f.name) !== null)
      .map(async (f) => ({ name: f.name, role: classifyFile(f.name), buffer: await f.arrayBuffer() })),
  );
  return assemble(loaded);
}

/**
 * Loads a hosted folder. Directories cannot be listed over HTTP, so the canonical file names are
 * tried, plus anything listed in an optional manifest.json ({"files": ["leiden_communities.parquet"]}).
 */
export async function loadFromUrl(base: string): Promise<LoadResult> {
  const root = base.replace(/\/+$/, "");
  const names = new Set<string>([...Object.values(CANONICAL_FILES).flat(), EMBEDDINGS_FILE]);
  try {
    const manifest = await fetch(`${root}/manifest.json`);
    if (manifest.ok && (manifest.headers.get("content-type") ?? "").includes("json")) {
      const json = (await manifest.json()) as { files?: string[] };
      (json.files ?? []).forEach((f) => names.add(f));
    }
  } catch {
    // no manifest: canonical names only
  }
  const loaded = await Promise.all(
    [...names].map(async (name): Promise<Loaded | null> => {
      const response = await fetch(`${root}/${name}`);
      // Dev servers answer unknown paths with index.html; treat that as missing.
      if (!response.ok || (response.headers.get("content-type") ?? "").includes("text/html")) return null;
      return { name, role: classifyFile(name), buffer: await response.arrayBuffer() };
    }),
  );
  const present = loaded.filter((f): f is Loaded => f !== null);
  if (present.length === 0) throw new Error(`No Parquet files found under ${root}.`);
  return assemble(present);
}

export interface DatasetRef {
  /** Path to pass to loadFromUrl, relative to the app (`./data/age`). */
  path: string;
  label: string;
}

/**
 * Datasets the server offers, from `<base>data/index.json`. The dev server and `npm run serve`
 * write it from the folders they were given; static hosting has no such file and the call is a
 * no-op, so the load screen simply falls back to the sample and to dropped files.
 */
export async function listDatasets(base: string): Promise<DatasetRef[]> {
  try {
    const response = await fetch(`${base}data/index.json`);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return [];
    const json = (await response.json()) as { datasets?: { path?: unknown; label?: unknown }[] };
    return (json.datasets ?? [])
      .map((entry) => ({ path: String(entry.path ?? ""), label: String(entry.label ?? entry.path ?? "") }))
      .filter((entry) => entry.path !== "");
  } catch {
    return [];
  }
}
