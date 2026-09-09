// Running a search and recording it. The engine takes its provider calls as arguments so the tests
// never reach the network and the view can cancel a run.
import type { Dataset, Partition } from "../model";
import type { EmbeddingIndex } from "../loaders/embeddings";
import { batchReports, collectReports, parseMapPoints, rankPoints, renderBatch, renderPoints, type GlobalOptions } from "./global";
import { buildLocalContext, rankEntities, type Seed, type LocalOptions } from "./local";
import type { ChatResult, Message, Provider, Usage } from "./llm";
import { chat as defaultChat, embed as defaultEmbed, traceableSettings } from "./llm";
import { localMessages, mapMessages, reduceMessages } from "./prompt";
import { emptyContext, type RunStage, type RunStats, type SearchRun, type SearchTrace, type SentMessage, TRACE_SCHEMA_VERSION } from "./types";

export interface Client {
  chat(provider: Provider, messages: Message[], opts?: { signal?: AbortSignal }): Promise<ChatResult>;
  embed(provider: Provider, input: string[], opts?: { signal?: AbortSignal }): Promise<Float32Array[]>;
}

export const liveClient: Client = { chat: defaultChat, embed: defaultEmbed };

class Meter {
  private readonly t0 = Date.now();
  private last = Date.now();
  readonly stages: RunStage[] = [];
  calls = 0;
  prompt: number | null = null;
  completion: number | null = null;

  stage(name: string, calls?: number): void {
    const now = Date.now();
    this.stages.push({ name, ms: now - this.last, ...(calls === undefined ? {} : { calls }) });
    this.last = now;
  }

  count(usage: Usage): void {
    this.calls += 1;
    if (usage.promptTokens !== null) this.prompt = (this.prompt ?? 0) + usage.promptTokens;
    if (usage.completionTokens !== null) this.completion = (this.completion ?? 0) + usage.completionTokens;
  }

  stats(): RunStats {
    return {
      elapsedMs: Date.now() - this.t0,
      llmCalls: this.calls,
      promptTokens: this.prompt,
      completionTokens: this.completion,
    };
  }
}

/** Live UI observation; never triggers another embedding request or enters the LLM prompt. */
export interface RetrievalObservation {
  query: string;
  queryVector: Float32Array;
  seeds: Seed[];
  contextEntityIds: string[];
}

export interface LocalRunInput {
  dataset: Dataset;
  partition: Partition | null;
  embeddings: EmbeddingIndex;
  provider: Provider;
  query: string;
  options: LocalOptions;
  onRetrieval?: (observation: RetrievalObservation) => void;
  responseLanguage: string;
  signal?: AbortSignal;
}

export async function runLocal(input: LocalRunInput, client: Client = liveClient): Promise<SearchRun> {
  const meter = new Meter();
  const settings = traceableSettings(input.provider, {
    topK: input.options.topK,
    tokenBudget: input.options.tokenBudget,
  });
  const sent: SentMessage[] = [];
  const base = { method: "local" as const, engine: "explorer", settings, stages: meter.stages, messages: sent };
  try {
    if (input.embeddings.vectors.size === 0) throw new Error("The embeddings file holds no vectors.");
    const [queryVector] = await client.embed(input.provider, [input.query], { signal: input.signal });
    meter.count({ promptTokens: null, completionTokens: null });
    meter.stage("embed", 1);

    const seeds = rankEntities(queryVector, input.embeddings, input.dataset, input.options.topK);
    const { context } = buildLocalContext(input.dataset, input.partition, seeds, input.options);
    meter.stage("select");
    input.onRetrieval?.({ query: input.query, queryVector, seeds, contextEntityIds: context.entities.flatMap(e => e.id ? [e.id] : []) });

    if (seeds.length === 0) {
      meter.stage("chat", 0);
      return { ...base, status: "ok", error: null, response: "", context, stats: meter.stats() };
    }

    const messages = localMessages(input.query, context, input.responseLanguage);
    sent.push(...messages.map((m) => ({ stage: "chat", role: m.role, content: m.content })));
    const answer = await client.chat(input.provider, messages, { signal: input.signal });
    meter.count(answer.usage);
    meter.stage("chat", 1);
    return { ...base, status: "ok", error: null, response: answer.text, context, stats: meter.stats() };
  } catch (error) {
    meter.stage("failed");
    return {
      ...base,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      response: "",
      context: emptyContext(),
      stats: meter.stats(),
    };
  }
}

export interface GlobalRunInput {
  partition: Partition | null;
  provider: Provider;
  query: string;
  options: GlobalOptions;
  responseLanguage: string;
  signal?: AbortSignal;
}

/** Batches to send plus the final call. The view shows this before spending anything. */
export function plannedCalls(partition: Partition | null, options: GlobalOptions): { reports: number; batches: number; calls: number } {
  const reports = collectReports(partition, options);
  const batches = batchReports(reports, options.batchTokens);
  return { reports: reports.length, batches: batches.length, calls: batches.length === 0 ? 0 : batches.length + 1 };
}

export async function runGlobal(input: GlobalRunInput, client: Client = liveClient): Promise<SearchRun> {
  const meter = new Meter();
  const settings = traceableSettings(input.provider, {
    level: input.options.level === null ? "all" : input.options.level,
    batchTokens: input.options.batchTokens,
    maxPoints: input.options.maxPoints,
  });
  const sent: SentMessage[] = [];
  const base = { method: "global" as const, engine: "explorer", settings, stages: meter.stages, messages: sent };
  const context = emptyContext();
  try {
    const reports = collectReports(input.partition, input.options);
    context.reports = reports.map(({ level: _level, ...rest }) => rest);
    const batches = batchReports(reports, input.options.batchTokens);
    meter.stage("collect");
    if (batches.length === 0) {
      return { ...base, status: "ok", error: null, response: "", context, stats: meter.stats() };
    }

    const points = [];
    for (const batch of batches) {
      const messages = mapMessages(input.query, renderBatch(batch));
      sent.push(...messages.map((m) => ({ stage: "map", role: m.role, content: m.content })));
      const result = await client.chat(input.provider, messages, { signal: input.signal });
      meter.count(result.usage);
      points.push(...parseMapPoints(result.text));
    }
    meter.stage("map", batches.length);

    const top = rankPoints(points, input.options.maxPoints);
    if (top.length === 0) {
      meter.stage("reduce", 0);
      return { ...base, status: "ok", error: null, response: "", context, stats: meter.stats() };
    }

    const reduce = reduceMessages(input.query, renderPoints(top), input.responseLanguage);
    sent.push(...reduce.map((m) => ({ stage: "reduce", role: m.role, content: m.content })));
    const answer = await client.chat(input.provider, reduce, { signal: input.signal });
    meter.count(answer.usage);
    meter.stage("reduce", 1);
    return { ...base, status: "ok", error: null, response: answer.text, context, stats: meter.stats() };
  } catch (error) {
    meter.stage("failed");
    return {
      ...base,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      response: "",
      context,
      stats: meter.stats(),
    };
  }
}

export function newTrace(query: string, label: string, files: Record<string, string>, runs: SearchRun[], version: string): SearchTrace {
  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    producer: { tool: "explorer", version },
    createdAt: new Date().toISOString(),
    index: { label, files },
    query,
    runs,
  };
}
