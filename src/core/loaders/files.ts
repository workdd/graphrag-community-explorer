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

/**
 * A saved run left in the index folder. The Ask tab offers it as one click, so a reader can see how
 * an answer maps back to records before deciding whether to configure a provider at all. It is data
 * about a past run, not part of the index, so it is not fingerprinted with the tables.
 */
export const EXAMPLE_RUN_FILE = "example-run.json";

export type FileRole =
  | { table: TableName }
  | { partition: string }
  | { reports: string }
  | { embeddings: true }
  | null;

export function classifyFile(name: string): FileRole {
  const base = name.split("/").pop()!.toLowerCase();
  if (base === EMBEDDINGS_FILE) return { embeddings: true };
  for (const [table, names] of Object.entries(CANONICAL_FILES)) {
    if (names.includes(base)) return { table: table as TableName };
  }
  // A community set brought alongside the index, and the summaries that belong to that set.
  // The reports pattern is tried first: "x_community_reports.parquet" also ends in "_reports".
  const extraReports = /^(.+)_community_reports\.parquet$/.exec(base);
  if (extraReports && extraReports[1] !== "create_final") return { reports: extraReports[1] };
  const extra = /^(.+)_communities\.parquet$/.exec(base);
  if (extra && extra[1] !== "create_final") return { partition: extra[1] };
  return null;
}

interface Loaded {
  name: string;
  role: FileRole;
  buffer: ArrayBuffer;
}

async function assemble(files: Loaded[], exampleRun?: string): Promise<LoadResult> {
  const tables: Partial<Record<TableName, Row[]>> = {};
  const extraPartitions: Record<string, Row[]> = {};
  const extraReports: Record<string, Row[]> = {};
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
    } else if ("reports" in file.role) {
      extraReports[file.role.reports] = rows;
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
    extraReports,
  };
  return { ...buildDataset(input, used), fingerprints, embeddings, embeddingsNote, exampleRun };
}

export const isExampleRun = (name: string): boolean => name.split("/").pop()!.toLowerCase() === EXAMPLE_RUN_FILE;

export async function loadFromFiles(files: File[]): Promise<LoadResult> {
  const loaded = await Promise.all(
    files
      .filter((f) => classifyFile(f.name) !== null)
      .map(async (f) => ({ name: f.name, role: classifyFile(f.name), buffer: await f.arrayBuffer() })),
  );
  const example = files.find((f) => isExampleRun(f.name));
  return assemble(loaded, example ? await example.text() : undefined);
}

/** The name a current GraphRAG run writes for each table. */
export const currentNames = (): string[] => Object.values(CANONICAL_FILES).map((names) => names[0]);

/** The create_final_* name of 0.3 to 0.5, for the tables that have one. */
const legacyNameFor = (table: TableName): string | undefined => CANONICAL_FILES[table][1];

/**
 * What a folder holds, when it says so itself.
 *
 * A manifest that names the entities file is describing the whole folder, so the list is used as it
 * stands and nothing is probed. One that does not is describing additions to the canonical names,
 * which is what `{"files": ["leiden_communities.parquet"]}` has always meant.
 */
export function manifestFiles(json: { files?: unknown }): { files: string[]; complete: boolean } {
  const files = Array.isArray(json.files) ? json.files.filter((f): f is string => typeof f === "string") : [];
  const entities = CANONICAL_FILES.entities;
  return { files, complete: files.some((name) => entities.includes(name.split("/").pop()!.toLowerCase())) };
}

/**
 * Loads a hosted folder. Directories cannot be listed over HTTP, so the file names have to be
 * guessed, and every guess that misses is a 404 in somebody's console. Three things keep that down:
 * a manifest is believed when it describes the whole folder, the names a current run writes are
 * tried first, and the create_final_* names of 0.3 to 0.5 are only tried for the tables that were
 * not found under their current name. An index is one generation or the other, never both.
 */
export async function loadFromUrl(base: string): Promise<LoadResult> {
  const root = base.replace(/\/+$/, "");
  const get = async (name: string): Promise<Loaded | null> => {
    try {
      const response = await fetch(`${root}/${name}`);
      // Dev servers answer unknown paths with index.html; treat that as missing.
      if (!response.ok || (response.headers.get("content-type") ?? "").includes("text/html")) return null;
      return { name, role: classifyFile(name), buffer: await response.arrayBuffer() };
    } catch {
      return null;
    }
  };

  let extra: string[] = [];
  let complete = false;
  try {
    const manifest = await fetch(`${root}/manifest.json`);
    if (manifest.ok && (manifest.headers.get("content-type") ?? "").includes("json")) {
      const listed = manifestFiles((await manifest.json()) as { files?: unknown });
      extra = listed.files;
      complete = listed.complete;
    }
  } catch {
    // no manifest: the names have to be guessed
  }

  const first = complete ? extra : [...currentNames(), EMBEDDINGS_FILE, ...extra];
  const present = (await Promise.all(first.map(get))).filter((f): f is Loaded => f !== null);

  if (!complete) {
    // Only the tables a current run would have written and this folder did not.
    const found = new Set(present.map((f) => f.name));
    const older = (Object.keys(CANONICAL_FILES) as TableName[])
      .filter((table) => !found.has(CANONICAL_FILES[table][0]))
      .map(legacyNameFor)
      .filter((name): name is string => name !== undefined);
    if (older.length > 0) {
      present.push(...(await Promise.all(older.map(get))).filter((f): f is Loaded => f !== null));
    }
  }

  if (present.length === 0) throw new Error(`No Parquet files found under ${root}.`);
  return assemble(present, await readExampleRun(root));
}

/** A missing or unreadable example is simply no example; it never stops an index from loading. */
export async function readExampleRun(root: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${root}/${EXAMPLE_RUN_FILE}`);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
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
