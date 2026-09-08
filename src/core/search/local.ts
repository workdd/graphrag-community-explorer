// Local search: rank entities against the question, walk out to what surrounds them, and pack the
// result into the prompt budget. The concept follows GraphRAG's local search; the selection and the
// budgeting are ours, so the views never present the result as the official implementation's.
import { claimsForEntity, evidenceForEntity } from "../evidence";
import { membershipIndex } from "../hierarchy";
import type { EmbeddingIndex } from "../loaders/embeddings";
import type { Community, Dataset, Partition } from "../model";
import { clip, estimateTokens, fill, type Group } from "./budget";
import { emptyContext, type ContextItem, type SearchContext } from "./types";

export interface Seed {
  id: string;
  title: string;
  score: number;
}

export interface LocalOptions {
  topK: number;
  tokenBudget: number;
  /** One long description must not be able to eat the whole budget. */
  maxFieldTokens: number;
  /** Chunks per seed entity, before the budget has its say. */
  sourcesPerSeed: number;
}

export const DEFAULT_LOCAL: LocalOptions = { topK: 10, tokenBudget: 8000, maxFieldTokens: 400, sourcesPerSeed: 3 };

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Cannot compare ${a.length} dimensions with ${b.length}.`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Highest scoring entities that the loaded dataset actually holds. */
export function rankEntities(query: Float32Array, index: EmbeddingIndex, dataset: Dataset, k: number): Seed[] {
  if (query.length !== index.dim) {
    throw new Error(`The question was embedded in ${query.length} dimensions but the file stores ${index.dim}.`);
  }
  const scored: Seed[] = [];
  for (const [id, vector] of index.vectors) {
    const entity = dataset.entities.get(id);
    if (!entity) continue;
    scored.push({ id, title: entity.title, score: cosine(query, vector) });
  }
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored.slice(0, Math.max(0, k));
}

interface Candidate extends ContextItem {
  bucket: "entities" | "relationships" | "reports" | "sources" | "claims";
}

const item = (c: Omit<Candidate, "shortId" | "tokens">): Candidate => ({
  ...c,
  shortId: "",
  tokens: estimateTokens(c.text),
});

function entityCandidates(dataset: Dataset, seeds: Seed[], max: number): Candidate[] {
  return seeds.flatMap((seed) => {
    const entity = dataset.entities.get(seed.id);
    if (!entity) return [];
    const description = clip(entity.description ?? "", max);
    return [
      item({
        bucket: "entities",
        id: entity.id,
        title: entity.title,
        text: `${entity.title} (${entity.type})${description ? `: ${description}` : ""}`,
        score: seed.score,
        raw: { id: entity.id, title: entity.title, type: entity.type, degree: entity.degree },
      }),
    ];
  });
}

function relationshipCandidates(dataset: Dataset, seedIds: Set<string>, max: number) {
  const inside: Candidate[] = [];
  const outside: Candidate[] = [];
  for (const edge of dataset.relationships) {
    const hasSource = seedIds.has(edge.sourceId);
    const hasTarget = seedIds.has(edge.targetId);
    if (!hasSource && !hasTarget) continue;
    const source = dataset.entities.get(edge.sourceId)?.title ?? edge.sourceId;
    const target = dataset.entities.get(edge.targetId)?.title ?? edge.targetId;
    const description = clip(edge.description ?? "", max);
    const candidate = item({
      bucket: "relationships",
      id: edge.id,
      title: `${source} → ${target}`,
      text: `${source} → ${target} (${edge.type})${description ? `: ${description}` : ""}`,
      score: edge.weight,
      raw: { id: edge.id, source, target, type: edge.type, weight: edge.weight },
    });
    (hasSource && hasTarget ? inside : outside).push(candidate);
  }
  const byWeight = (a: Candidate, b: Candidate) => (b.score ?? 0) - (a.score ?? 0);
  return { inside: inside.sort(byWeight), outside: outside.sort(byWeight) };
}

function reportCandidates(partition: Partition | null, seeds: Seed[], max: number): Candidate[] {
  if (!partition) return [];
  const index = membershipIndex(partition);
  const hits = new Map<string, { community: Community; seeds: number }>();
  for (const seed of seeds) {
    for (const community of index.get(seed.id) ?? []) {
      const found = hits.get(community.id);
      if (found) found.seeds += 1;
      else hits.set(community.id, { community, seeds: 1 });
    }
  }
  return [...hits.values()]
    .filter((hit) => hit.community.report !== undefined)
    .sort((a, b) => b.seeds - a.seeds || (b.community.report?.rank ?? 0) - (a.community.report?.rank ?? 0))
    .map((hit) =>
      item({
        bucket: "reports",
        id: hit.community.id,
        title: hit.community.title,
        text: `${hit.community.title}: ${clip(hit.community.report?.summary ?? "", max)}`,
        score: hit.community.report?.rank,
        raw: { id: hit.community.id, level: hit.community.level, rank: hit.community.report?.rank },
      }),
    );
}

function sourceCandidates(dataset: Dataset, seeds: Seed[], perSeed: number, max: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const seed of seeds) {
    for (const evidence of evidenceForEntity(dataset, seed.id).slice(0, perSeed)) {
      if (seen.has(evidence.unit.id)) continue;
      seen.add(evidence.unit.id);
      out.push(
        item({
          bucket: "sources",
          id: evidence.unit.id,
          title: evidence.documentTitles[0] ?? evidence.unit.id,
          text: clip(evidence.unit.text, max),
          raw: { id: evidence.unit.id, documents: evidence.documentTitles },
        }),
      );
    }
  }
  return out;
}

function claimCandidates(dataset: Dataset, seeds: Seed[], max: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const seed of seeds) {
    for (const claim of claimsForEntity(dataset, seed.id)) {
      if (seen.has(claim.id)) continue;
      seen.add(claim.id);
      out.push(
        item({
          bucket: "claims",
          id: claim.id,
          title: `${claim.subjectTitle} (${claim.type})`,
          text: `${claim.subjectTitle} (${claim.type}): ${clip(claim.description, max)}`,
          raw: { id: claim.id, status: claim.status },
        }),
      );
    }
  }
  return out;
}

export interface LocalContext {
  context: SearchContext;
  tokens: number;
  truncated: boolean;
  /** Items left out per priority group, for the view to report honestly. */
  dropped: Record<string, number>;
}

/**
 * Packs the surroundings of the seeds into the budget. Priority order is seeds, relationships
 * between seeds, community reports, source chunks, claims, then relationships that leave the seed
 * set. Numbers are handed out after the cut, so a citation can only name something the model saw.
 */
export function buildLocalContext(
  dataset: Dataset,
  partition: Partition | null,
  seeds: Seed[],
  options: LocalOptions = DEFAULT_LOCAL,
): LocalContext {
  const seedIds = new Set(seeds.map((s) => s.id));
  const { inside, outside } = relationshipCandidates(dataset, seedIds, options.maxFieldTokens);
  const groups: Group<Candidate>[] = [
    { key: "entities", items: entityCandidates(dataset, seeds, options.maxFieldTokens) },
    { key: "relationships-inside", items: inside },
    { key: "reports", items: reportCandidates(partition, seeds, options.maxFieldTokens) },
    { key: "sources", items: sourceCandidates(dataset, seeds, options.sourcesPerSeed, options.maxFieldTokens) },
    { key: "claims", items: claimCandidates(dataset, seeds, options.maxFieldTokens) },
    { key: "relationships-outside", items: outside },
  ];

  const filled = fill(groups, (c) => c.tokens ?? 0, options.tokenBudget);
  const context = emptyContext();
  const dropped: Record<string, number> = {};
  for (const group of filled.groups) {
    if (group.dropped > 0) dropped[group.key] = group.dropped;
    for (const candidate of group.taken) {
      const { bucket, ...rest } = candidate;
      context[bucket].push({ ...rest });
    }
  }
  for (const kind of Object.keys(context) as (keyof SearchContext)[]) {
    context[kind].forEach((entry, i) => {
      entry.shortId = String(i + 1);
    });
  }
  return { context, tokens: filled.tokens, truncated: filled.truncated, dropped };
}
