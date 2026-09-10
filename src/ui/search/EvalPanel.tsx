// Asking a set of questions in one go, and what each one reached.
//
// The set is whatever this index offers: the questions derived from its own records, plus the
// evaluation scenarios when the index has the entity types they are written against. Nothing here
// judges the prose. It says whether retrieval reached anything and whether the answer pointed at
// any of it, because those two are checkable without a ground truth and are where an index gives
// itself away.
import { useState } from "react";
import {
  evalCsv,
  runSet,
  summarize,
  type EvalProgress,
  type EvalQuestion,
  type EvalRow,
  type EvalRunner,
} from "../../core/search/evaluate";
import type { SearchRun } from "../../core/search/types";
import { downloadText } from "../download";
import { fmt } from "../format";
import { useT } from "../i18n";

interface Props {
  questions: EvalQuestion[];
  /** Runs one question. The caller owns the provider, the method and the budget. */
  run: EvalRunner;
  /** True when a provider is configured; a set costs real calls. */
  ready: boolean;
  /** Model calls one question of each method costs, so the total can be stated before it is spent. */
  callsFor: (question: EvalQuestion) => number;
  onSaveRuns: (rows: EvalRow[], runs: SearchRun[]) => void;
}

const STATUS_LABEL: Record<EvalRow["status"], string> = {
  answered: "answered",
  uncited: "cited nothing",
  empty: "retrieved nothing",
  failed: "failed",
};

export function EvalPanel({ questions, run, ready, callsFor, onSaveRuns }: Props) {
  const { t } = useT();
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [progress, setProgress] = useState<EvalProgress | null>(null);
  const [stop, setStop] = useState<AbortController | null>(null);

  if (questions.length === 0) return null;

  const calls = questions.reduce((sum, question) => sum + callsFor(question), 0);
  const summary = summarize(rows);

  const start = async () => {
    const controller = new AbortController();
    setStop(controller);
    setRows([]);
    setRuns([]);
    const collected: EvalRow[] = [];
    const kept: SearchRun[] = [];
    try {
      await runSet(
        {
          questions,
          signal: controller.signal,
          onProgress: setProgress,
          onRow: (row, made) => {
            collected.push(row);
            kept.push(made);
            setRows([...collected]);
            setRuns([...kept]);
          },
        },
        run,
      );
    } finally {
      setProgress(null);
      setStop(null);
    }
  };

  return (
    <details className="eval">
      <summary>
        {t("Ask the whole set ({n})", { n: questions.length })}
      </summary>

      <p className="notice info">
        {t("{n} questions, about {calls} model calls. They are asked one at a time, and a question that fails does not stop the rest.", {
          n: questions.length,
          calls: fmt(calls),
        })}
      </p>

      <div className="row">
        {progress ? (
          <>
            <progress value={progress.done} max={Math.max(1, progress.total)} />
            <span>{t("Asked {done} of {total}", { done: progress.done, total: progress.total })}</span>
            <button className="btn small" onClick={() => stop?.abort()}>{t("Stop")}</button>
            <span className="muted">{progress.asking}</span>
          </>
        ) : (
          <>
            <button className="btn small" onClick={() => void start()} disabled={!ready}>
              {t("Ask them all")}
            </button>
            {ready ? null : <span className="muted">{t("Set up a provider first")}</span>}
            {rows.length > 0 ? (
              <>
                <button className="btn small" onClick={() => downloadText("evaluation.csv", evalCsv(rows))}>
                  {t("Save the table as CSV")}
                </button>
                <button className="btn small" onClick={() => onSaveRuns(rows, runs)}>
                  {t("Save every run as one trace")}
                </button>
              </>
            ) : null}
          </>
        )}
      </div>

      {rows.length > 0 ? (
        <>
          <p className="muted eval-summary">
            {t("{answered} answered with a citation, {uncited} cited nothing they were given, {empty} retrieved nothing, {failed} failed. {calls} model calls, {tokens} tokens, {seconds}s.", {
              answered: summary.answered,
              uncited: summary.uncited,
              empty: summary.empty,
              failed: summary.failed,
              calls: fmt(summary.llmCalls),
              tokens: fmt(summary.promptTokens + summary.completionTokens),
              seconds: (summary.elapsedMs / 1000).toFixed(1),
            })}
          </p>
          <table className="ctable eval-table">
            <thead>
              <tr>
                <th>{t("Question")}</th>
                <th>{t("Method")}</th>
                <th>{t("Outcome")}</th>
                <th className="num">{t("Retrieved")}</th>
                <th className="num">{t("Cited")}</th>
                <th className="num">{t("Calls")}</th>
                <th className="num">{t("Seconds")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.status === "answered" ? undefined : `eval-${row.status}`}>
                  <td className="title" title={row.question}>{row.title ?? row.question}</td>
                  <td>{row.method === "local" ? t("Local") : t("Global")}</td>
                  <td>{t(STATUS_LABEL[row.status])}{row.error ? `: ${row.error}` : ""}</td>
                  <td className="num">{fmt(row.retrieved)}</td>
                  <td className="num">{fmt(row.cited)}</td>
                  <td className="num">{fmt(row.llmCalls)}</td>
                  <td className="num">{(row.elapsedMs / 1000).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            {t("Nothing here judges the wording. A question that retrieved nothing is the index's problem; one that was handed evidence and cited none of it is where an answer stops being checkable.")}
          </p>
        </>
      ) : null}
    </details>
  );
}
