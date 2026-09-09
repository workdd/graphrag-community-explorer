import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { EmbeddingIndex } from "../../core/loaders/embeddings";
import type { Dataset, Partition } from "../../core/model";
import { mismatches } from "../../core/search/fingerprint";
import { DEFAULT_GLOBAL } from "../../core/search/global";
import { DEFAULT_LOCAL } from "../../core/search/local";
import { newTrace, plannedCalls, runGlobal, runLocal, type RetrievalObservation } from "../../core/search/run";
import { suggestQuestions } from "../../core/search/suggestions";
import { parseTraceJson, traceJson, TraceError } from "../../core/search/trace";
import { emptyContext, type SearchContext, type SearchMethod, type SearchRun, type SearchTrace } from "../../core/search/types";
import { downloadText } from "../download";
import { fill, Rich, useT } from "../i18n";
import { citedShortIds, countUsage, sameSelection, type Selection } from "../../core/search/highlight";
import { Answer } from "./Answer";
import { Pipeline } from "./Pipeline";
import { SystemMap } from "./SystemMap";
import { RecordPanel } from "./RecordPanel";
import { readableLink, readableTitle } from "./label";
import { ScenarioPanel } from "./ScenarioPanel";
import { EmbeddingSearch } from "./EmbeddingSearch";

// Cytoscape is heavy and only the evidence graph needs it, so it loads with the first answer.
const EvidenceGraph = lazy(() => import("./EvidenceGraph").then((m) => ({ default: m.EvidenceGraph })));
const EmbeddingSpace = lazy(() => import("./EmbeddingSpace").then((m) => ({ default: m.EmbeddingSpace })));
import { fromEnvironment, isConfigured, maskKey, PRESETS, readProvider, writeProvider, clearProvider } from "./provider";
import "./search.css";

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  embeddings?: EmbeddingIndex;
  embeddingsNote?: string;
  fingerprints: Record<string, string>;
  label: string;
  version: string;
  onOpenCommunity: (id: string) => void;
  onOpenEntity: (id: string) => void;
}

const KIND_LABEL: Record<keyof SearchContext, string> = {
  entities: "Entities",
  relationships: "Relationships",
  reports: "Reports",
  sources: "Sources",
  claims: "Claims",
};

/** Marks a field the environment already filled in, so nobody hunts for where a value came from. */
function FromEnv() {
  const { t } = useT();
  return <span className="from-env" title={t("Set before start by VITE_LLM_* in the environment")}>{t("preset")}</span>;
}

const store = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function SearchView(props: Props) {
  const { t } = useT();
  const [provider, setProvider] = useState(() => readProvider(store()));
  const preset = useMemo(() => fromEnvironment(), []);
  const [showSettings, setShowSettings] = useState(() => !isConfigured(readProvider(store())));
  const [method, setMethod] = useState<SearchMethod>(props.embeddings ? "local" : "global");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<SearchRun | null>(null);
  const [runQuery, setRunQuery] = useState("");
  const [retrieval, setRetrieval] = useState<RetrievalObservation | null>(null);
  useEffect(() => setRetrieval(null), [props.dataset, props.embeddings]);
  const [imported, setImported] = useState<SearchTrace | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pane, setPane] = useState<"graph" | "space">("graph");
  const fileInput = useRef<HTMLInputElement>(null);

  const ready = isConfigured(provider);
  const stale = useMemo(
    () => (props.embeddings ? mismatches(props.embeddings.sourceFiles, props.fingerprints) : []),
    [props.embeddings, props.fingerprints],
  );
  const globalPlan = useMemo(() => plannedCalls(props.partition, DEFAULT_GLOBAL), [props.partition]);
  const examples = useMemo(
    () => suggestQuestions({ dataset: props.dataset, partition: props.partition, hasEmbeddings: props.embeddings !== undefined }),
    [props.dataset, props.partition, props.embeddings],
  );
  const localReady = props.embeddings !== undefined && stale.length === 0;

  const save = (next: typeof provider) => {
    setProvider(next);
    writeProvider(store(), next);
  };

  const ask = async () => {
    const query = question.trim();
    if (query === "" || busy || !ready || (method === "local" ? !localReady : globalPlan.reports === 0)) return;
    abort.current = new AbortController();
    setBusy(true);
    if (method === "global") setRetrieval(null);
    let observed = false;
    setImported(null);
    setNotes([]);
    try {
      const result =
        method === "local" && props.embeddings
          ? await runLocal({
              dataset: props.dataset,
              partition: props.partition,
              embeddings: props.embeddings,
              provider,
              query,
              options: DEFAULT_LOCAL,
              onRetrieval: (value) => { observed = true; setRetrieval(value); },
              responseLanguage: t("English"),
              signal: abort.current.signal,
            })
          : await runGlobal({
              partition: props.partition,
              provider,
              query,
              options: DEFAULT_GLOBAL,
              responseLanguage: t("English"),
              signal: abort.current.signal,
            });
      if (!observed) setRetrieval(null);
      setRun(result);
      setRunQuery(query);
      setSelection(null);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const exportTrace = () => {
    if (!run) return;
    const trace = newTrace(runQuery, props.label, props.fingerprints, [run], props.version);
    downloadText("search-trace.json", traceJson(trace));
  };

  const importTrace = async (file: File) => {
    setRetrieval(null);
    try {
      const load = parseTraceJson(await file.text());
      setImported(load.trace);
      setRun(load.trace.runs[0] ?? null);
      setSelection(null);
      setQuestion(load.trace.query);
      const wrong = mismatches(load.trace.index.files, props.fingerprints);
      setNotes([
        ...load.notes,
        ...(wrong.length > 0
          ? [t("This trace was made from another index ({files}), so its citations are not linked.", { files: wrong.join(", ") })]
          : []),
      ]);
    } catch (error) {
      setImported(null);
      setRun(null);
      setNotes([error instanceof TraceError ? error.message : String(error)]);
    }
  };

  const linked = imported === null || mismatches(imported.index.files, props.fingerprints).length === 0;

  const cited = useMemo(
    () => citedShortIds(run?.response ?? "", run?.context ?? emptyContext()),
    [run],
  );
  const usage = useMemo(() => countUsage(run?.context ?? emptyContext(), cited), [run, cited]);

  return (
    <div className="search">
      <div className="row">
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={method === "local"}
            className={method === "local" ? "active" : ""}
            disabled={!localReady}
            title={localReady ? undefined : t("Needs embeddings.parquet")}
            onClick={() => setMethod("local")}
          >
            {t("Local")}
          </button>
          <button
            role="tab"
            aria-selected={method === "global"}
            className={method === "global" ? "active" : ""}
            disabled={globalPlan.reports === 0}
            title={globalPlan.reports > 0 ? undefined : t("Needs community_reports.parquet")}
            onClick={() => setMethod("global")}
          >
            {t("Global")}
          </button>
        </div>
        <button className="btn" onClick={() => setShowSettings((v) => !v)}>
          {ready ? t("Provider: {key}", { key: maskKey(provider.apiKey) }) : t("Set up a provider")}
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()}>{t("Open a trace")}</button>
        <button className="btn" onClick={exportTrace} disabled={!run || imported !== null}>{t("Save this run")}</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importTrace(file);
            e.target.value = "";
          }}
        />
      </div>

      <p className="notice info">
        <Rich text={t("Browsing stays in this tab. **Asking a question sends the selected evidence to the provider you configure.**")} />
      </p>

      {showSettings ? (
        <div className="settings">
          <h3>{t("Provider")}</h3>
          <div className="row">
            {PRESETS.map((preset) => (
              <button
                className="btn"
                key={preset.id}
                onClick={() =>
                  save({ ...provider, baseUrl: preset.baseUrl, chatModel: preset.chatModel, embedModel: preset.embedModel })
                }
              >
                {preset.label}
              </button>
            ))}
            <button
              className="btn"
              onClick={() => {
                clearProvider(store());
                setProvider(readProvider(null));
              }}
            >
              {t("Forget the key")}
            </button>
          </div>
          <div className="grid">
            <label>
              {t("Base URL")}{preset.fromEnv.includes("baseUrl") ? <FromEnv /> : null}
              <input className="field" value={provider.baseUrl} onChange={(e) => save({ ...provider, baseUrl: e.target.value })} />
            </label>
            <label>
              {t("API key")}{preset.fromEnv.includes("apiKey") ? <FromEnv /> : null}
              <input
                className="field"
                type="password"
                autoComplete="off"
                value={provider.apiKey}
                onChange={(e) => save({ ...provider, apiKey: e.target.value })}
              />
            </label>
            <label>
              {t("Chat model")}{preset.fromEnv.includes("chatModel") ? <FromEnv /> : null}
              <input className="field" value={provider.chatModel} onChange={(e) => save({ ...provider, chatModel: e.target.value })} />
            </label>
            <label>
              {t("Embedding model")}{preset.fromEnv.includes("embedModel") ? <FromEnv /> : null}
              <input className="field" value={provider.embedModel} onChange={(e) => save({ ...provider, embedModel: e.target.value })} />
            </label>
          </div>
          <p className="muted">
            {preset.fromEnv.includes("apiKey")
              ? t("The key comes from the environment this app was started with. Typing one here keeps it in this browser instead. The build refuses to publish an environment key unless it is asked to.")
              : t("The key is kept in this browser only. It is never written into a saved run. Clear it on a shared computer.")}
          </p>
          {PRESETS[0].note && provider.baseUrl.includes("upstage") ? <p className="muted">{t(PRESETS[0].note)}</p> : null}
        </div>
      ) : null}

      {props.embeddingsNote ? <p className="notice warn">{props.embeddingsNote}</p> : null}
      {stale.length > 0 ? (
        <p className="notice stop">
          {t("The embeddings file was made from a different index ({files}). Local search is off.", { files: stale.join(", ") })}
        </p>
      ) : null}
      {!props.embeddings && !props.embeddingsNote ? (
        <p className="notice warn">
          {t("Local search needs an embeddings.parquet next to the index. The embed_index tool writes one.")}
        </p>
      ) : null}
      {method === "global" && globalPlan.calls > 0 ? (
        <p className="notice info">
          {t("Global reads {reports} reports in {batches} batches, so this question costs about {calls} model calls.", {
            reports: globalPlan.reports,
            batches: globalPlan.batches,
            calls: globalPlan.calls,
          })}
        </p>
      ) : null}

      {examples.length > 0 && !busy ? (
        <div className="examples">
          <span className="muted">{t("Try one:")}</span>
          {examples.map((example, i) => (
            <button
              key={i}
              className="chip"
              title={t(example.why)}
              onClick={() => {
                setQuestion(fill(t(example.template), example.vars));
                setMethod(example.method);
              }}
            >
              <b>{example.method === "local" ? t("Local") : t("Global")}</b>
              {fill(t(example.template), example.vars)}
            </button>
          ))}
        </div>
      ) : null}

      <ScenarioPanel
        dataset={props.dataset}
        method={method}
        busy={busy}
        localReady={localReady}
        globalReady={globalPlan.reports > 0}
        onChoose={(query, nextMethod) => {
          setQuestion(query);
          setMethod(nextMethod);
        }}
      />

      <details className="system" open>
        <summary>{t("How a question reaches an answer")}</summary>
        <SystemMap
          dataset={props.dataset}
          partition={props.partition}
          embeddings={props.embeddings}
          method={method}
          run={run}
        />
      </details>

      <div className="ask">
        <textarea
          value={question}
          placeholder={t("Ask about this index")}
          aria-label={t("Ask about this index")}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
          }}
        />
        <button className="btn primary" disabled={!ready || busy || question.trim() === "" || (method === "local" ? !localReady : globalPlan.reports === 0)} onClick={() => void ask()}>
          {busy ? t("Asking…") : t("Ask")}
        </button>
        {busy ? <button className="btn" onClick={() => abort.current?.abort()}>{t("Stop")}</button> : null}
      </div>

      {retrieval && props.embeddings ? <EmbeddingSearch index={props.embeddings} dataset={props.dataset} observation={retrieval} /> : null}

      {notes.map((note, i) => (
        <p key={i} className="notice warn">{note}</p>
      ))}

      {imported ? (
        <p className="notice info">
          {t("Showing a saved run from {tool} {version}, made on {when}.", {
            tool: imported.producer.tool,
            version: imported.producer.version,
            when: imported.createdAt.slice(0, 19).replace("T", " "),
          })}
        </p>
      ) : null}

      {run?.status === "error" ? <p className="notice stop">{run.error}</p> : null}

      {run && run.status === "ok" && run.response !== "" ? (
        <Answer text={run.response} context={run.context} selection={selection} onSelect={setSelection} />
      ) : null}

      {run && run.status === "ok" && run.response === "" ? (
        <p className="notice warn">{t("Nothing in this index was close enough to the question to answer it.")}</p>
      ) : null}

      {run ? (
        <>
          <div className="stats">
            <span>{t("Engine")}: <b>{run.engine}</b></span>
            <span>{t("Method")}: <b>{run.method}</b></span>
            <span>{t("Model calls")}: <b>{run.stats.llmCalls}</b></span>
            <span>
              {t("Tokens")}:{" "}
              <b>
                {run.stats.promptTokens === null
                  ? t("not reported")
                  : `${run.stats.promptTokens} + ${run.stats.completionTokens ?? 0}`}
              </b>
            </span>
            <span>{t("Elapsed")}: <b>{(run.stats.elapsedMs / 1000).toFixed(1)}s</b></span>
            {run.stages.map((stage) => (
              <span key={stage.name}>{stage.name}: <b>{stage.ms}ms</b></span>
            ))}
          </div>

          <Pipeline run={run} />

          <p className="muted usage">
            {t("The answer cited {cited} of the {retrieved} records that were sent to the model.", { cited: usage.cited, retrieved: usage.retrieved })}
          </p>

          <div className="segmented pane-switch" role="tablist">
            <button role="tab" aria-selected={pane === "graph"} className={pane === "graph" ? "active" : ""} onClick={() => setPane("graph")}>
              {t("Relationships")}
            </button>
            <button
              role="tab"
              aria-selected={pane === "space"}
              className={pane === "space" ? "active" : ""}
              disabled={props.embeddings === undefined}
              title={props.embeddings ? undefined : t("Needs embeddings.parquet")}
              onClick={() => setPane("space")}
            >
              {t("Embedding space")}
            </button>
          </div>

          <div className="split">
            <Suspense fallback={<p className="muted">{t("Drawing the evidence…")}</p>}>
              {pane === "space" && props.embeddings ? (
                <EmbeddingSpace
                  dataset={props.dataset}
                  embeddings={props.embeddings}
                  context={run.context}
                  cited={cited}
                  selection={selection}
                  onSelect={setSelection}
                />
              ) : (
                <EvidenceGraph context={run.context} cited={cited} selection={selection} onSelect={setSelection} />
              )}
            </Suspense>
            <RecordPanel
              dataset={props.dataset}
              context={run.context}
              selection={selection}
              onSelect={setSelection}
              onOpenEntity={linked ? props.onOpenEntity : null}
              onOpenCommunity={linked ? props.onOpenCommunity : null}
            />
          </div>

          <div className="used">
            {(Object.keys(KIND_LABEL) as (keyof SearchContext)[])
              .filter((kind) => run.context[kind].length > 0)
              .map((kind) => (
                <div key={kind}>
                  <h3>{t(KIND_LABEL[kind])} ({run.context[kind].length}) <span className="muted">{t("{n} cited", { n: cited[kind].size })}</span></h3>
                  <table>
                    <thead>
                      <tr>
                        <th className="n">#</th>
                        <th>{t("Used as evidence")}</th>
                        <th className="s">{t("Score")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.context[kind].map((entry) => {
                        const picked = sameSelection(selection, { kind, shortId: entry.shortId });
                        const wasCited = cited[kind].has(entry.shortId);
                        return (
                          <tr
                            key={entry.shortId}
                            className={`${picked ? "picked" : ""} ${wasCited ? "cited" : ""}`.trim()}
                            onClick={() => setSelection(picked ? null : { kind, shortId: entry.shortId })}
                          >
                            <td className="n">{entry.shortId}</td>
                            <td>
                              <b>{kind === "relationships" ? readableLink(entry.title) : readableTitle(entry.title)}</b>
                              {wasCited ? <span className="used-mark">{t("cited")}</span> : null}
                              <div className="muted">{entry.text}</div>
                            </td>
                            <td className="s">{entry.score === undefined ? "" : entry.score.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
