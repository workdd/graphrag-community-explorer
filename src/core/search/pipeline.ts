// The run described as the steps it actually took, with the numbers it actually produced. Every
// value here comes from the recorded run: nothing is a nominal figure from the design.
import { estimateTokens } from "./budget";
import type { CitedShortIds } from "./highlight";
import type { SearchRun } from "./types";

export interface Step {
  key: string;
  /** English source string; the view translates it. */
  label: string;
  /** The measured figure, already formatted, or null when the run did not record one. */
  value: string | null;
  detail: string | null;
}

const ms = (run: SearchRun, name: string): number | null =>
  run.stages.find((stage) => stage.name === name)?.ms ?? null;

const count = (run: SearchRun, kind: keyof SearchRun["context"]): number => run.context[kind].length;

const promptTokens = (run: SearchRun): string => {
  if (run.stats.promptTokens !== null) return `${run.stats.promptTokens}`;
  // No usage came back, so say what we estimated rather than leaving a blank.
  const estimated = run.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  return estimated > 0 ? `~${estimated}` : "?";
};

/** The chain for a local run: rank, walk out, cut to the budget, ask once. */
function localSteps(run: SearchRun, cited: CitedShortIds): Step[] {
  const seeds = count(run, "entities");
  const links = count(run, "relationships");
  const reports = count(run, "reports");
  const sources = count(run, "sources");
  const embed = ms(run, "embed");
  const chat = ms(run, "chat");
  const citedTotal = Object.values(cited).reduce((sum, set) => sum + set.size, 0);
  return [
    // The model that did the embedding belongs on the embedding step. Naming it on the question box
    // as well made the same fact appear twice in a row.
    { key: "question", label: "Question", value: null, detail: null },
    {
      key: "embed",
      label: "Embedded once",
      value: embed === null ? null : `${embed}ms`,
      detail: run.settings.embedModel ? String(run.settings.embedModel) : null,
    },
    { key: "rank", label: "Ranked by cosine", value: `${seeds}`, detail: `top ${run.settings.topK ?? seeds}` },
    { key: "expand", label: "Walked out", value: `${links + reports + sources}`, detail: `${links} links, ${reports} reports, ${sources} chunks` },
    { key: "budget", label: "Cut to the budget", value: run.settings.tokenBudget ? `${run.settings.tokenBudget}` : null, detail: "estimated tokens" },
    { key: "prompt", label: "Prompt", value: promptTokens(run), detail: `${run.messages.filter((m) => m.stage === "chat").length} messages` },
    { key: "model", label: "Model", value: chat === null ? null : `${chat}ms`, detail: run.settings.chatModel ? String(run.settings.chatModel) : null },
    { key: "answer", label: "Answer", value: `${citedTotal}`, detail: "records cited" },
  ];
}

/** The chain for a global run: gather reports, batch them, map each, reduce once. */
function globalSteps(run: SearchRun, cited: CitedShortIds): Step[] {
  const reports = count(run, "reports");
  const mapStage = run.stages.find((stage) => stage.name === "map");
  const reduce = ms(run, "reduce");
  const citedTotal = Object.values(cited).reduce((sum, set) => sum + set.size, 0);
  return [
    { key: "question", label: "Question", value: null, detail: null },
    { key: "collect", label: "Community summaries", value: `${reports}`, detail: run.settings.level === undefined ? null : `level ${run.settings.level}` },
    { key: "batch", label: "Batched", value: mapStage?.calls === undefined ? null : `${mapStage.calls}`, detail: run.settings.batchTokens ? `${run.settings.batchTokens} tokens each` : null },
    { key: "map", label: "Points pulled out", value: mapStage?.ms === undefined ? null : `${mapStage.ms}ms`, detail: `${mapStage?.calls ?? 0} calls` },
    { key: "prompt", label: "Prompt", value: promptTokens(run), detail: `${run.messages.length} messages` },
    { key: "reduce", label: "Written once", value: reduce === null ? null : `${reduce}ms`, detail: run.settings.chatModel ? String(run.settings.chatModel) : null },
    { key: "answer", label: "Answer", value: `${citedTotal}`, detail: "records cited" },
  ];
}

export const describeRun = (run: SearchRun, cited: CitedShortIds): Step[] =>
  run.method === "global" ? globalSteps(run, cited) : localSteps(run, cited);
