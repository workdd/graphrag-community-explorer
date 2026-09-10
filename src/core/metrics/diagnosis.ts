// What this index will and will not answer.
//
// The quality view already computes coverage, modularity and sizes. A number on its own does not
// tell anyone whether to build on the index or index it again, so this turns the same measurements
// into named problems: what was measured, what it costs a search, and what to change upstream.
//
// Every rule reads the loaded files and nothing else. Where a rule has a threshold it is named and
// its reason is written down, because a threshold nobody can argue with is a threshold nobody
// checks.
import { membershipIndex } from "../hierarchy";
import type { Dataset, Partition } from "../model";
import type { LevelQuality } from "./quality";

export type Severity = "fix" | "watch" | "ok";

/** Which part of the product a finding bites. The view says this next to the title. */
export type Affects = "global" | "local" | "both" | "evidence" | "none";

/** A view worth opening to see the records behind a finding. */
export type Destination = "map" | "table" | "quality" | "network" | "ask";

export interface Finding {
  id: string;
  severity: Severity;
  affects: Affects;
  /** English source with {placeholders}; the view translates and fills. */
  title: string;
  detail: string;
  /** What to change. Null when the finding is not a problem, or when nothing can be done here. */
  fix: string | null;
  vars: Record<string, string | number>;
  link?: { to: Destination; label: string };
}

export interface DiagnosisInput {
  dataset: Dataset;
  partition: Partition | null;
  levels: LevelQuality[];
  hasEmbeddings: boolean;
}

/**
 * A tenth of the entities missing from every community is the point where a global answer starts
 * being confidently incomplete rather than merely partial. Below that it is worth knowing but not
 * worth re-indexing for.
 */
const UNCLAIMED_SERIOUS = 0.1;

/** An entity with no relationship at all. A few are normal; a fifth of the index is a extraction problem. */
const ISOLATED_NOTABLE = 0.05;

/**
 * A community holding this much of its level is not a community, it is the level. Its summary has to
 * describe everything, so global search cites it whatever it was asked.
 */
const DOMINANT_SHARE = 0.4;

/** Below three communities a level cannot have a dominant one in any meaningful sense. */
const DOMINANT_MIN_COMMUNITIES = 3;

/**
 * Newman modularity below 0.3 is the usual reading for "this partition does not follow the graph".
 * The community summaries then group entities that are not related to each other.
 */
const MODULARITY_FLOOR = 0.3;

/** Title plus description shorter than this has nothing in it for a cosine to rank on. */
const THIN_DESCRIPTION_CHARS = 24;
const THIN_SERIOUS = 0.6;
const THIN_NOTABLE = 0.25;

/** One entity on this share of all relationship ends drags every clustering run towards it. */
const HUB_SHARE = 0.2;

/**
 * In a graph of a dozen nodes every node holds a large share of the ends and none of them is a hub.
 * The rule only means something once there are enough entities for one to stand out from the rest.
 */
const HUB_MIN_ENTITIES = 25;

/** Relationship text is what local search puts in the prompt for an edge. */
const EMPTY_EDGE_TEXT_NOTABLE = 0.5;

const share = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);
const percent = (value: number): string => `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;

/** Entities that no community of this partition claims, at any level. */
export function unclaimedEntities(dataset: Dataset, partition: Partition | null): string[] {
  if (!partition) return [];
  const index = membershipIndex(partition);
  const out: string[] = [];
  for (const id of dataset.entities.keys()) {
    if ((index.get(id) ?? []).length === 0) out.push(id);
  }
  return out;
}

/** The busiest entity by relationship ends, and how much of the graph it touches. */
export function busiestEntity(dataset: Dataset): { title: string; share: number } | null {
  let best: { title: string; degree: number } | null = null;
  for (const entity of dataset.entities.values()) {
    if (!best || entity.degree > best.degree) best = { title: entity.title, degree: entity.degree };
  }
  if (!best || best.degree === 0) return null;
  return { title: best.title, share: share(best.degree, dataset.relationships.length * 2) };
}

export function diagnose(input: DiagnosisInput): Finding[] {
  const { dataset, partition, levels, hasEmbeddings } = input;
  const found: Finding[] = [];
  const entities = dataset.entities.size;

  // Entities no community claims. Global search never sees them, whatever they say.
  if (partition) {
    const unclaimed = unclaimedEntities(dataset, partition);
    if (unclaimed.length > 0) {
      const missing = share(unclaimed.length, entities);
      found.push({
        id: "unclaimed",
        severity: missing >= UNCLAIMED_SERIOUS ? "fix" : "watch",
        affects: "global",
        title: "{count} entities ({share}) belong to no community",
        detail:
          "Global search reads community summaries and nothing else, so these entities cannot appear in a global answer. Local search still reaches them.",
        fix: "Most of them have no relationship for the clustering to use. Check what extraction produced, or cluster every connected component instead of the largest one.",
        vars: { count: unclaimed.length, share: percent(missing) },
        link: { to: "map", label: "See them under the bands" },
      });
    }
  }

  // Entities with no relationship at all.
  let isolated = 0;
  for (const entity of dataset.entities.values()) if (entity.degree === 0) isolated += 1;
  if (share(isolated, entities) >= ISOLATED_NOTABLE) {
    found.push({
      id: "isolated",
      severity: "watch",
      affects: "both",
      title: "{count} entities ({share}) have no relationship",
      detail:
        "An entity with no edge carries no neighbourhood, so local search retrieves it on its own and clustering has nothing to place it by.",
      fix: "Extraction usually produced these from a passing mention. Shorter chunks, or a prompt tuned to this corpus, produce fewer of them.",
      vars: { count: isolated, share: percent(share(isolated, entities)) },
      link: { to: "network", label: "Show them on the graph" },
    });
  }

  // One community standing for its whole level.
  if (partition) {
    for (const level of levels) {
      if (level.communities < DOMINANT_MIN_COMMUNITIES || level.coveredEntities === 0) continue;
      const biggest = share(level.largestSize, level.coveredEntities);
      if (biggest < DOMINANT_SHARE) continue;
      found.push({
        id: `dominant-l${level.level}`,
        severity: "fix",
        affects: "global",
        title: "One community holds {size} of the {covered} entities at L{level}",
        detail:
          "A summary that stands for {share} of a level has to describe everything, so global search cites it whatever it was asked.",
        fix: "Lower max_cluster_size, or raise the Leiden resolution, and cluster again. The Formation view runs it here first.",
        vars: { size: level.largestSize, covered: level.coveredEntities, level: level.level, share: percent(biggest) },
        link: { to: "quality", label: "Compare the levels" },
      });
      break; // one is the point; naming every level repeats it
    }
  }

  // Communities global search cannot read.
  if (partition) {
    let without = 0;
    for (const community of partition.communities.values()) if (!community.report) without += 1;
    if (without > 0) {
      found.push({
        id: "no-reports",
        severity: "fix",
        affects: "global",
        title: "{count} of {total} communities have no summary",
        detail: "Global search reads summaries and nothing else, so a community without one is not read at all.",
        fix: "tools/summarize_communities.py writes a summary file for a community set that has none.",
        vars: { count: without, total: partition.communities.size },
        link: { to: "table", label: "Sort by report" },
      });
    }
  }

  // Whether the grouping follows the graph.
  if (levels.length > 0) {
    const best = levels.reduce((a, b) => (b.modularity > a.modularity ? b : a));
    const reading = levels.map((level) => level.modularity.toFixed(3)).join(" / ");
    if (best.modularity < MODULARITY_FLOOR) {
      found.push({
        id: "low-modularity",
        severity: "fix",
        affects: "global",
        title: "Modularity is {reading}, and the highest is below {floor}",
        detail:
          "Modularity compares the relationships inside communities against a random rewiring. This low, the communities cut across the graph rather than following it, and their summaries group entities that are not related.",
        fix: "The graph may have too few relationships to cluster at all. Check the relationship count against the entity count before trusting any global answer.",
        vars: { reading, floor: MODULARITY_FLOOR.toFixed(1) },
        link: { to: "quality", label: "See it per level" },
      });
    } else {
      found.push({
        id: "modularity-holds",
        severity: "ok",
        affects: "none",
        title: "Modularity is {reading}",
        detail: "Above {floor} the communities follow the graph rather than cutting across it, so their summaries are about something.",
        fix: null,
        vars: { reading, floor: MODULARITY_FLOOR.toFixed(1) },
      });
    }
  }

  // What local search has to rank on.
  let thin = 0;
  for (const entity of dataset.entities.values()) {
    if (`${entity.title} ${entity.description ?? ""}`.trim().length < THIN_DESCRIPTION_CHARS) thin += 1;
  }
  const thinShare = share(thin, entities);
  if (thinShare >= THIN_NOTABLE) {
    found.push({
      id: "thin-descriptions",
      severity: thinShare >= THIN_SERIOUS ? "fix" : "watch",
      affects: "local",
      title: "{share} of entities have almost no description",
      detail:
        "Local search ranks by cosine between the question and the entity's title and description. An entity with a bare title ranks close to nothing in particular.",
      fix: "Description quality comes from the extraction and summarization prompts. graphrag prompt-tune writes ones fitted to the corpus.",
      vars: { share: percent(thinShare), count: thin },
      link: { to: "table", label: "Look at the entities" },
    });
  }

  // What local search puts in the prompt for an edge.
  let bareEdges = 0;
  for (const relationship of dataset.relationships) {
    if ((relationship.description ?? "").trim() === "") bareEdges += 1;
  }
  const bareShare = share(bareEdges, dataset.relationships.length);
  if (bareShare >= EMPTY_EDGE_TEXT_NOTABLE) {
    found.push({
      id: "bare-relationships",
      severity: "watch",
      affects: "local",
      title: "{share} of relationships carry no description",
      detail:
        "The description is what a relationship contributes to a prompt. Without one the model is told that two entities are connected and nothing about how.",
      fix: "Exports from a property graph often drop the description. Carry it across if the source has one.",
      vars: { share: percent(bareShare), count: bareEdges },
    });
  }

  // One entity the whole graph hangs off.
  const busiest = entities >= HUB_MIN_ENTITIES ? busiestEntity(dataset) : null;
  if (busiest && busiest.share >= HUB_SHARE) {
    found.push({
      id: "hub",
      severity: "watch",
      affects: "both",
      title: "{title} touches {share} of all relationships",
      detail:
        "Clustering pulls everything towards a node like this, and a picture of it is a star rather than a graph. The views fold its spokes away; a global summary cannot.",
      fix: null,
      vars: { title: busiest.title, share: percent(busiest.share) },
      link: { to: "network", label: "Open it" },
    });
  }

  // Whether a citation can be traced past the record.
  if (dataset.textUnits.size === 0) {
    found.push({
      id: "no-text-units",
      severity: "watch",
      affects: "evidence",
      title: "This index shipped no source text",
      detail:
        "Without text_units.parquet a citation stops at the record. You can see which entity an answer used, but not the sentence it was drawn from.",
      fix: "Load text_units.parquet and documents.parquet alongside the index if the run wrote them.",
      vars: {},
    });
  } else {
    found.push({
      id: "source-text",
      severity: "ok",
      affects: "none",
      title: "{count} source chunks are loaded",
      detail: "A citation can be followed past the record to the text it came from.",
      fix: null,
      vars: { count: dataset.textUnits.size },
    });
  }

  // Whether local search can run at all.
  if (!hasEmbeddings) {
    found.push({
      id: "no-embeddings",
      severity: "watch",
      affects: "local",
      title: "No entity vectors, so local search is off",
      detail:
        "GraphRAG writes entity embeddings to a vector store rather than to Parquet, and a browser cannot read one. Global search does not need them.",
      fix: "The Ask tab can build them here, through the provider you configure, or tools/embed_index writes them to a file.",
      vars: {},
      link: { to: "ask", label: "Open the Ask tab" },
    });
  }

  const rank: Record<Severity, number> = { fix: 0, watch: 1, ok: 2 };
  return found.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export const countBySeverity = (findings: Finding[], severity: Severity): number =>
  findings.filter((finding) => finding.severity === severity).length;
