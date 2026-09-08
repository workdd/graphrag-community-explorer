// Example questions built from the index that is open, not from a fixed list. A canned question
// about a dataset nobody loaded proves nothing; these name entities and communities that are
// actually there, so a click exercises the real retrieval path.
import { displayTitle } from "../graph/palette";
import type { Community, Dataset, Partition } from "../model";
import type { SearchMethod } from "./types";

export interface Suggestion {
  /** English source string with {placeholders}; the view runs it through the translator. */
  template: string;
  vars: Record<string, string>;
  method: SearchMethod;
  /** What this question is meant to exercise, shown as the chip's tooltip. */
  why: string;
}

export interface SuggestionInput {
  dataset: Dataset;
  partition: Partition | null;
  /** Local questions are only offered when the sidecar that answers them is loaded. */
  hasEmbeddings: boolean;
}

/** A node linked to a large share of the graph says nothing about any particular question. */
export const HUB_SHARE = 0.05;

/** Below this many links nothing is a hub, however small the index is. */
export const MIN_HUB_DEGREE = 20;

/**
 * Types an impact question is usually asked about. No structural measure picks these out: on the
 * cloud inventory the graph ranks Subnet and VirtualNetwork just as highly, so this is a stated
 * domain preference rather than something the data implies. An index without any of these types
 * falls back to the structural order below, so the hint costs nothing elsewhere.
 */
export const PREFERRED_TYPES = ["virtualmachine", "vm", "instance", "server", "host", "container", "pod"];

/**
 * A name has to carry a word for the question to be answerable. Local search embeds the question and
 * compares it with entity text: a bare id like "7809779" embeds to nothing in particular, so the
 * ranking returns ten other records and the model answers, correctly, that it was told nothing about
 * the one that was named. A named record makes the example exercise the path rather than its edge.
 */
const HAS_WORD = /[A-Za-z가-힣ぁ-ゟ゠-ヿ一-鿿]{2}/u;

/**
 * Entities a question can name: well connected, but not the categorical hubs. Asking what the
 * default volume type is connected to returns a third of the index and tests nothing.
 */
export interface Subject {
  name: string;
  /** The schema type, named in the question so the reader knows what kind of thing this is. */
  type: string;
}

function topEntities(dataset: Dataset, count: number): Subject[] {
  const connected = [...dataset.entities.values()]
    .filter((entity) => entity.degree > 0)
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title));
  const cap = Math.max(MIN_HUB_DEGREE, Math.round(dataset.entities.size * HUB_SHARE));
  const withoutHubs = connected.filter((entity) => entity.degree <= cap);
  // On a small index every node looks like a hub. Dropping the cap there beats offering nothing.
  const chosen = withoutHubs.length > 0 ? withoutHubs : connected;
  const preferred = chosen.filter((entity) => PREFERRED_TYPES.includes(entity.type.toLowerCase()));
  // Two records can share a display name once the id suffix is stripped. Asking how a thing relates
  // to a thing of the same name is meaningless, and the reader could not tell them apart anyway.
  const pool = preferred.length > 0 ? preferred : chosen;
  const named = pool.filter((entity) => HAS_WORD.test(displayTitle(entity)));
  const seen = new Set<string>();
  const subjects: Subject[] = [];
  for (const entity of named.length > 0 ? named : pool) {
    const name = displayTitle(entity);
    const label = `${entity.type}\u0000${name}`;
    if (name.trim() === "" || seen.has(label)) continue;
    seen.add(label);
    subjects.push({ name, type: entity.type });
    if (subjects.length === count) break;
  }
  return subjects;
}

/**
 * Only communities with a report: global search reads summaries and nothing else. A pair is taken
 * from one level, because comparing a community with its own parent compares a thing to itself.
 */
function topReportedCommunities(partition: Partition | null, count: number): Community[] {
  if (!partition) return [];
  const reported = [...partition.communities.values()].filter((community) => community.report !== undefined);
  if (reported.length === 0) return [];
  const byRank = (a: Community, b: Community) =>
    (b.report?.rank ?? 0) - (a.report?.rank ?? 0) || b.size - a.size || a.title.localeCompare(b.title);
  const ranked = [...reported].sort(byRank);

  const named = (level: number) => {
    const seen = new Set<string>();
    return ranked.filter((c) => c.level === level && !seen.has(c.title) && seen.add(c.title));
  };
  // The best community's own level first. If it stands alone there, the level with the most
  // reported communities gives a pair worth comparing rather than none at all.
  const levels = [...new Set(ranked.map((c) => c.level))];
  const fallback = levels.map(named).sort((a, b) => b.length - a.length)[0] ?? [];
  const preferred = named(ranked[0].level);
  return (preferred.length >= Math.min(count, 2) ? preferred : fallback).slice(0, count);
}

export function suggestQuestions(input: SuggestionInput): Suggestion[] {
  const out: Suggestion[] = [];
  const entities = topEntities(input.dataset, 3);
  const communities = topReportedCommunities(input.partition, 2);

  if (input.hasEmbeddings && entities.length > 0) {
    out.push({
      template: "What is {type} {entity} connected to, and what do those links mean?",
      vars: { entity: entities[0].name, type: entities[0].type },
      method: "local",
      why: "Ranks entities against the question, then reads their neighbours and source text.",
    });
  }
  if (input.hasEmbeddings && entities.length > 1) {
    out.push({
      template: "How are {type} {entity} and {otherType} {other} related?",
      vars: { entity: entities[0].name, type: entities[0].type, other: entities[1].name, otherType: entities[1].type },
      method: "local",
      why: "Two starting points at once: checks that the context keeps both and their shared links.",
    });
    out.push({
      template: "If {type} {entity} were removed or scaled down, what else would be affected?",
      vars: { entity: entities[1].name, type: entities[1].type },
      method: "local",
      why: "Impact question: the answer is only as good as the relationships the context carried.",
    });
  }
  if (input.hasEmbeddings && entities.length > 2) {
    out.push({
      template: "What depends on {type} {entity}, and what does it depend on?",
      vars: { entity: entities[2].name, type: entities[2].type },
      method: "local",
      why: "Asks for both directions of a link, which a one-sided context answers wrongly.",
    });
  }
  if (communities.length > 0) {
    out.push({
      template: "What are the main themes across this index?",
      vars: {},
      method: "global",
      why: "Reads every community summary at the chosen level; nothing else reaches the model.",
    });
  }
  if (communities.length > 1) {
    out.push({
      template: "What do {community} and {other} each cover, and how do they connect?",
      vars: { community: communities[0].title, other: communities[1].title },
      method: "global",
      why: "Names two summaries, so a wrong answer points at the summary rather than the retrieval.",
    });
  }
  return out;
}
