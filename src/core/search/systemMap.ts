// The run as a language-model system: what is retrieved, how it is packed into a context window,
// what each model call is for, and what comes back. Files appear as a note on the step that reads
// them, not as boxes of their own: the question this answers is about the model, not the disk.
import type { EmbeddingIndex } from "../loaders/embeddings";
import type { Dataset, Partition } from "../model";
import { estimateTokens } from "./budget";
import type { SearchMethod, SearchRun } from "./types";

/** The four things an LLM search does, in order. */
export type Zone = "retrieval" | "context" | "model" | "response";

export interface SystemNode {
  id: string;
  zone: Zone;
  label: string;
  /** The measured figure, or null when the run recorded none. */
  value: string | null;
  /** One line of what this step is, in model terms. English source; the view translates it. */
  note: string | null;
  /** Values for the placeholders in `note`. */
  noteVars?: Record<string, string>;
  /** True when this step is a call to the provider. */
  call?: boolean;
  row: number;
}

export interface SystemFlow {
  from: string;
  to: string;
  label: string | null;
  /** True when this flow carries text out of the browser to the provider. */
  leaves: boolean;
}

export interface SystemMap {
  nodes: SystemNode[];
  flows: SystemFlow[];
}

export interface SystemInput {
  dataset: Dataset;
  partition: Partition | null;
  embeddings?: EmbeddingIndex;
  method: SearchMethod;
  run?: SearchRun | null;
}

const fmt = (n: number): string => n.toLocaleString();
const stage = (run: SearchRun | null | undefined, name: string) => run?.stages.find((s) => s.name === name);

const promptTokens = (run: SearchRun | null | undefined): string | null => {
  if (!run) return null;
  if (run.stats.promptTokens !== null) return fmt(run.stats.promptTokens);
  const estimated = run.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  return estimated > 0 ? `~${fmt(estimated)}` : null;
};

function localMap(input: SystemInput): SystemMap {
  const run = input.run ?? null;
  const embed = stage(run, "embed");
  const chat = stage(run, "chat");
  const reports = run ? run.context.reports.length : null;
  const nodes: SystemNode[] = [
    {
      id: "embedCall", zone: "retrieval", row: 0, call: true,
      label: "Embed the question",
      value: embed ? `${embed.ms}ms` : null,
      note: input.embeddings ? "{model} · {dim}d" : "needs the sidecar",
      noteVars: input.embeddings ? { model: input.embeddings.model, dim: String(input.embeddings.dim) } : undefined,
    },
    {
      id: "vector", zone: "retrieval", row: 1,
      label: "Nearest by cosine",
      value: run ? fmt(run.context.entities.length) : null,
      note: input.embeddings ? "over {n} entity vectors" : null,
      noteVars: input.embeddings ? { n: fmt(input.embeddings.vectors.size) } : undefined,
    },
    {
      id: "graph", zone: "retrieval", row: 2,
      label: "Follow the graph",
      value: run ? fmt(run.context.relationships.length) : null,
      note: "relationships of the seeds, out of {n}",
      noteVars: { n: fmt(input.dataset.relationships.length) },
    },
    {
      id: "summaries", zone: "retrieval", row: 3,
      label: "Community summaries",
      value: reports === null ? null : fmt(reports),
      note: "of the communities the seeds belong to",
    },
    {
      id: "pack", zone: "context", row: 0,
      label: "Pack the context window",
      value: run?.settings.tokenBudget ? fmt(Number(run.settings.tokenBudget)) : null,
      note: "seeds, then links, summaries, chunks, claims",
    },
    {
      id: "number", zone: "context", row: 1,
      label: "Number every item",
      value: run ? fmt(Object.values(run.context).reduce((n, list) => n + list.length, 0)) : null,
      note: "so a citation can name one",
    },
    {
      id: "prompt", zone: "context", row: 2,
      label: "System and user message",
      value: promptTokens(run),
      note: "prompt tokens the provider counted",
    },
    {
      id: "chatCall", zone: "model", row: 0, call: true,
      label: "One completion",
      value: chat ? `${chat.ms}ms` : null,
      note: run?.settings.chatModel ? "{model} · temperature 0" : null,
      noteVars: run?.settings.chatModel ? { model: String(run.settings.chatModel) } : undefined,
    },
    {
      id: "out", zone: "response", row: 0,
      label: "Completion tokens",
      value: run?.stats.completionTokens != null ? fmt(run.stats.completionTokens) : null,
      note: "what the model wrote back",
    },
    {
      id: "parse", zone: "response", row: 1,
      label: "Read the citations",
      value: null,
      note: "[Data: Entities (3); Reports (1)] back to records",
    },
  ];
  const flows: SystemFlow[] = [
    { from: "embedCall", to: "vector", label: "query vector", leaves: false },
    { from: "vector", to: "graph", label: "seeds", leaves: false },
    { from: "graph", to: "summaries", label: null, leaves: false },
    { from: "vector", to: "pack", label: null, leaves: false },
    { from: "graph", to: "pack", label: null, leaves: false },
    { from: "summaries", to: "pack", label: null, leaves: false },
    { from: "pack", to: "number", label: "what fits", leaves: false },
    { from: "number", to: "prompt", label: null, leaves: false },
    { from: "prompt", to: "chatCall", label: "the evidence text", leaves: true },
    { from: "chatCall", to: "out", label: null, leaves: false },
    { from: "out", to: "parse", label: null, leaves: false },
  ];
  return { nodes, flows };
}

function globalMap(input: SystemInput): SystemMap {
  const run = input.run ?? null;
  const mapStage = stage(run, "map");
  const reduce = stage(run, "reduce");
  const available = input.partition
    ? [...input.partition.communities.values()].filter((c) => c.report !== undefined).length
    : 0;
  const nodes: SystemNode[] = [
    {
      id: "collect", zone: "retrieval", row: 0,
      label: "Every summary at the level",
      value: run ? fmt(run.context.reports.length) : fmt(available),
      note: "no ranking: global reads them all",
    },
    {
      id: "batch", zone: "context", row: 0,
      label: "Split into context windows",
      value: mapStage?.calls === undefined ? null : fmt(mapStage.calls),
      note: run?.settings.batchTokens ? "{n} tokens a batch" : null,
      noteVars: run?.settings.batchTokens ? { n: fmt(Number(run.settings.batchTokens)) } : undefined,
    },
    {
      id: "mapCall", zone: "model", row: 0, call: true,
      label: "One completion a batch",
      value: mapStage ? `${mapStage.ms}ms` : null,
      note: "pull out scored points, JSON only",
    },
    {
      id: "rank", zone: "context", row: 1,
      label: "Keep the best points",
      value: run?.settings.maxPoints ? fmt(Number(run.settings.maxPoints)) : null,
      note: "by the score the model gave each",
    },
    {
      id: "reduceCall", zone: "model", row: 1, call: true,
      label: "One completion more",
      value: reduce ? `${reduce.ms}ms` : null,
      note: run?.settings.chatModel ? String(run.settings.chatModel) : null,
    },
    {
      id: "out", zone: "response", row: 0,
      label: "Completion tokens",
      value: run?.stats.completionTokens != null ? fmt(run.stats.completionTokens) : null,
      note: "what the model wrote back",
    },
    {
      id: "parse", zone: "response", row: 1,
      label: "Read the citations",
      value: null,
      note: "[Data: Reports (2)] back to communities",
    },
  ];
  const flows: SystemFlow[] = [
    { from: "collect", to: "batch", label: null, leaves: false },
    { from: "batch", to: "mapCall", label: "every summary", leaves: true },
    { from: "mapCall", to: "rank", label: "scored points", leaves: false },
    { from: "rank", to: "reduceCall", label: "the points that survived", leaves: true },
    { from: "reduceCall", to: "out", label: null, leaves: false },
    { from: "out", to: "parse", label: null, leaves: false },
  ];
  return { nodes, flows };
}

export const describeSystem = (input: SystemInput): SystemMap =>
  input.method === "global" ? globalMap(input) : localMap(input);

export const leavingFlows = (map: SystemMap): SystemFlow[] => map.flows.filter((flow) => flow.leaves);

/** Steps that are calls to the provider. These are what a run costs. */
export const modelCalls = (map: SystemMap): SystemNode[] => map.nodes.filter((node) => node.call === true);

/**
 * SVG cannot measure text before it is drawn, so a label's width is estimated: Hangul and the CJK
 * ranges take about one em a character, everything else about half. The estimate only has to be
 * generous enough that a label fits the space reserved for it.
 */
const WIDE = /[ᄀ-ᇿ⺀-꓏ꥠ-꥿가-퟿豈-﫿︰-﹏＀-｠]/;

export function labelWidth(text: string, fontPx: number): number {
  let em = 0;
  for (const ch of text) em += WIDE.test(ch) ? 1 : 0.52;
  return em * fontPx;
}

/**
 * Labels on flows that cross from one zone to the next. These are drawn in the gap between two
 * columns, so the gap has to be at least as wide as the widest of them or the text runs over a box.
 */
export function crossZoneLabels(map: SystemMap): string[] {
  const zone = new Map(map.nodes.map((node) => [node.id, node.zone]));
  return map.flows
    .filter((flow) => flow.label !== null && zone.get(flow.from) !== zone.get(flow.to))
    .map((flow) => flow.label as string);
}
