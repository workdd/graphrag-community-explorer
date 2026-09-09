// The parts a question passes through, as nodes and the flows between them. Kept as data so the
// drawing has nothing to decide: what is on screen is what the run and the loaded files say.
import type { EmbeddingIndex } from "../loaders/embeddings";
import type { Dataset, Partition } from "../model";
import type { SearchMethod, SearchRun } from "./types";

/** Where a part lives. The boundary between "browser" and "provider" is the one that matters. */
export type Zone = "offline" | "files" | "browser" | "provider";

export interface SystemNode {
  id: string;
  zone: Zone;
  label: string;
  /** Measured figure for this part, or null when nothing was recorded. */
  value: string | null;
  /** Row within its zone, top to bottom. */
  row: number;
}

export interface SystemFlow {
  from: string;
  to: string;
  label: string | null;
  /** True when this flow carries data out of the browser. */
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
  /** Absent before anything has been asked; the map then shows the shape without the figures. */
  run?: SearchRun | null;
}

const fmt = (n: number): string => n.toLocaleString();
const ms = (run: SearchRun | null | undefined, name: string): string | null => {
  const found = run?.stages.find((stage) => stage.name === name);
  return found ? `${found.ms}ms` : null;
};

function localMap(input: SystemInput): SystemMap {
  const run = input.run ?? null;
  const reports = input.partition
    ? [...input.partition.communities.values()].filter((c) => c.report !== undefined).length
    : 0;
  const nodes: SystemNode[] = [
    { id: "runner", zone: "offline", label: "embed_index runner", value: input.embeddings ? input.embeddings.model : null, row: 0 },
    { id: "entities", zone: "files", label: "entities.parquet", value: fmt(input.dataset.entities.size), row: 0 },
    { id: "relationships", zone: "files", label: "relationships.parquet", value: fmt(input.dataset.relationships.length), row: 1 },
    { id: "reports", zone: "files", label: "community_reports.parquet", value: fmt(reports), row: 2 },
    { id: "vectors", zone: "files", label: "embeddings.parquet", value: input.embeddings ? `${fmt(input.embeddings.vectors.size)} × ${input.embeddings.dim}` : null, row: 3 },
    { id: "question", zone: "browser", label: "Question", value: null, row: 0 },
    { id: "rank", zone: "browser", label: "Cosine ranking", value: run ? fmt(run.context.entities.length) : null, row: 1 },
    { id: "expand", zone: "browser", label: "Neighbours and summaries", value: run ? fmt(run.context.relationships.length + run.context.reports.length + run.context.sources.length) : null, row: 2 },
    { id: "budget", zone: "browser", label: "Budget cut", value: run?.settings.tokenBudget ? fmt(Number(run.settings.tokenBudget)) : null, row: 3 },
    { id: "prompt", zone: "browser", label: "Prompt assembled", value: run?.stats.promptTokens !== undefined && run?.stats.promptTokens !== null ? fmt(run.stats.promptTokens) : null, row: 4 },
    { id: "answer", zone: "browser", label: "Answer and citations", value: run ? fmt(run.stats.completionTokens ?? 0) : null, row: 5 },
    { id: "embedApi", zone: "provider", label: "Embeddings endpoint", value: ms(run, "embed"), row: 0 },
    { id: "chatApi", zone: "provider", label: "Chat endpoint", value: ms(run, "chat"), row: 1 },
  ];
  const flows: SystemFlow[] = [
    { from: "runner", to: "vectors", label: "writes", leaves: false },
    { from: "question", to: "embedApi", label: "the question text", leaves: true },
    { from: "embedApi", to: "rank", label: "query vector", leaves: false },
    { from: "vectors", to: "rank", label: null, leaves: false },
    { from: "entities", to: "rank", label: null, leaves: false },
    { from: "rank", to: "expand", label: "seeds", leaves: false },
    { from: "relationships", to: "expand", label: null, leaves: false },
    { from: "reports", to: "expand", label: null, leaves: false },
    { from: "expand", to: "budget", label: null, leaves: false },
    { from: "budget", to: "prompt", label: null, leaves: false },
    { from: "prompt", to: "chatApi", label: "the selected evidence", leaves: true },
    { from: "chatApi", to: "answer", label: null, leaves: false },
  ];
  return { nodes, flows };
}

function globalMap(input: SystemInput): SystemMap {
  const run = input.run ?? null;
  const reports = input.partition
    ? [...input.partition.communities.values()].filter((c) => c.report !== undefined).length
    : 0;
  const mapStage = run?.stages.find((stage) => stage.name === "map");
  const nodes: SystemNode[] = [
    { id: "reports", zone: "files", label: "community_reports.parquet", value: fmt(reports), row: 0 },
    { id: "question", zone: "browser", label: "Question", value: null, row: 0 },
    { id: "collect", zone: "browser", label: "Summaries at the level", value: run ? fmt(run.context.reports.length) : null, row: 1 },
    { id: "batch", zone: "browser", label: "Batched", value: mapStage?.calls === undefined ? null : fmt(mapStage.calls), row: 2 },
    { id: "points", zone: "browser", label: "Points kept", value: run?.settings.maxPoints ? fmt(Number(run.settings.maxPoints)) : null, row: 3 },
    { id: "answer", zone: "browser", label: "Answer and citations", value: run ? fmt(run.stats.completionTokens ?? 0) : null, row: 4 },
    { id: "mapApi", zone: "provider", label: "Chat endpoint, once a batch", value: mapStage ? `${mapStage.ms}ms` : null, row: 0 },
    { id: "reduceApi", zone: "provider", label: "Chat endpoint, once more", value: ms(run, "reduce"), row: 1 },
  ];
  const flows: SystemFlow[] = [
    { from: "reports", to: "collect", label: null, leaves: false },
    { from: "question", to: "collect", label: null, leaves: false },
    { from: "collect", to: "batch", label: null, leaves: false },
    { from: "batch", to: "mapApi", label: "every summary at the level", leaves: true },
    { from: "mapApi", to: "points", label: "scored points", leaves: false },
    { from: "points", to: "reduceApi", label: "the surviving points", leaves: true },
    { from: "reduceApi", to: "answer", label: null, leaves: false },
  ];
  return { nodes, flows };
}

export const describeSystem = (input: SystemInput): SystemMap =>
  input.method === "global" ? globalMap(input) : localMap(input);

/** Flows that carry something out of the browser. The view marks exactly these. */
export const leavingFlows = (map: SystemMap): SystemFlow[] => map.flows.filter((flow) => flow.leaves);
