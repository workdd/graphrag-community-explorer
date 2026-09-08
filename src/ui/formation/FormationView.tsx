import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { buildGraph, runLeiden, type LeidenStep } from "../../core/community/leiden";
import { displayTitle } from "../../core/graph/palette";
import { withSeed } from "../../core/graph/seed";
import type { Community, Dataset, Partition } from "../../core/model";
import { compareAssignments } from "../../core/metrics/compare";
import { assignmentAtLevel } from "../../core/metrics/quality";
import { levelsByDepth } from "../../core/hierarchy";
import { fmt } from "../format";
import { attachClouds, cloudColors, type CloudGroup } from "../graph/clouds";
import { useT } from "../i18n";

cytoscape.use(fcose);

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  selected: Community | null;
}

type Scope = "all" | "top" | "community";
const TOP_NODES = 400;
/** Below this the whole index is drawn; above it the busiest entities are, so the picture stays readable. */
const WHOLE_INDEX_LIMIT = 600;
const SPEEDS = [{ label: "0.5x", ms: 1600 }, { label: "1x", ms: 800 }, { label: "2x", ms: 400 }, { label: "4x", ms: 200 }];

const PHASE_TEXT: Record<LeidenStep["phase"], string> = {
  start: "Every entity starts in a community of its own.",
  moving: "Local moving: each entity joins the neighbouring community that raises modularity the most. It repeats until a sweep moves nobody.",
  refinement: "Refinement: inside each community every entity starts alone again and only merges with well connected neighbours. This is what keeps a community from falling into disconnected pieces, which is Leiden's fix to Louvain.",
  aggregation: "Aggregation: each refined group becomes a single node carrying its internal weight as a self loop, and the next round moves those nodes. The communities of this round become the next level up.",
  done: "No sweep moves anything: the run is finished.",
};

export function FormationView({ dataset, partition, selected }: Props) {
  const { t } = useT();
  const [scope, setScope] = useState<Scope>(() => (dataset.entities.size <= WHOLE_INDEX_LIMIT ? "all" : "top"));
  const [resolution, setResolution] = useState(1);
  const [seed, setSeed] = useState(42);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);

  // Entities the run works on. Leiden is computed on exactly what is drawn, so the picture is the run.
  const entityIds = useMemo(() => {
    if (scope === "community" && selected) return selected.entityIds.filter((id) => dataset.entities.has(id));
    const all = [...dataset.entities.values()];
    if (scope === "all") return all.map((e) => e.id);
    return all.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)).slice(0, TOP_NODES).map((e) => e.id);
  }, [dataset, scope, selected]);

  const run = useMemo(() => {
    const { graph, entityIds: order } = buildGraph(dataset, entityIds);
    const steps: LeidenStep[] = [];
    const started = performance.now();
    const result = runLeiden(graph, { resolution, seed, onStep: (step) => steps.push(step) });
    return { graph, order, steps, result, ms: performance.now() - started };
  }, [dataset, entityIds, resolution, seed]);

  const step = run.steps[Math.min(index, run.steps.length - 1)] ?? run.steps[0];

  useEffect(() => setIndex(0), [run]);

  useEffect(() => {
    if (!playing) return;
    if (index >= run.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, run.steps.length - 1)), SPEEDS[speed].ms);
    return () => clearTimeout(timer);
  }, [playing, index, run, speed]);

  // One layout for the whole playback: only colour changes between steps, so the eye can follow moves.
  useEffect(() => {
    if (!host.current || !wrap.current) return;
    const { graph, order } = run;
    const nodes = order.map((id, i) => {
      const entity = dataset.entities.get(id)!;
      return { data: { id: String(i), label: displayTitle(entity), size: 8 + Math.min(18, Math.sqrt(entity.degree) * 4) } };
    });
    const edges: cytoscape.EdgeDefinition[] = [];
    for (let i = 0; i < graph.n; i++) {
      for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
        const j = graph.targets[e];
        if (i < j) edges.push({ data: { id: `e${i}-${j}`, source: String(i), target: String(j) } });
      }
    }
    const cy = withSeed(`formation:${order.length}:${edges.length}`, () =>
      cytoscape({
        container: host.current!,
        elements: { nodes, edges },
        style: [
          { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "#8c96a0", "border-width": 1, "border-color": "#ffffff", label: "", "transition-property": "background-color", "transition-duration": 180 } },
          { selector: "node.moved", style: { "border-width": 3, "border-color": "#1b2430" } },
          { selector: "edge", style: { width: 1, "line-color": "#c9cfd6", "curve-style": "haystack", opacity: 0.6 } },
          { selector: "edge.inside", style: { "line-color": "#7b8794", opacity: 0.9 } },
        ],
        layout: { name: "fcose", quality: "default", randomize: true, animate: false, nodeRepulsion: 6000, idealEdgeLength: 60, numIter: 1200 } as cytoscape.LayoutOptions,
        maxZoom: 4,
        minZoom: 0.05,
      }),
    );
    cyRef.current = cy;
    const detach = attachClouds(cy, wrap.current, () => cloudsRef.current);
    if (import.meta.env.DEV) (window as unknown as { __cyFormation?: cytoscape.Core }).__cyFormation = cy;
    return () => {
      detach();
      cy.destroy();
      cyRef.current = undefined;
    };
  }, [run, dataset]);

  // Clouds are read by the canvas layer on every render, so they must be a ref rather than state.
  const cloudsRef = useRef<CloudGroup[]>([]);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !step) return;
    const members = new Map<number, string[]>();
    step.membership.forEach((community, node) => {
      const list = members.get(community);
      if (list) list.push(String(node));
      else members.set(community, [String(node)]);
    });
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const community = step.membership[Number(node.id())];
        node.style("background-color", cloudColors(community).stroke);
      });
      cy.nodes().removeClass("moved");
      step.movedNodes.forEach((node) => cy.getElementById(String(node)).addClass("moved"));
      cy.edges().forEach((edge) => {
        const same = step.membership[Number(edge.source().id())] === step.membership[Number(edge.target().id())];
        edge.toggleClass("inside", same);
      });
    });
    // Only groups worth outlining: a hull around a single node is noise.
    cloudsRef.current = [...members.entries()]
      .filter(([, ids]) => ids.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 40)
      .map(([community, ids]) => ({ id: String(community), label: "", ...cloudColors(community), elementIds: ids }));
    cy.forceRender();
  }, [step]);

  // How close this step already is to the community set the index shipped, on the entities in the run.
  const stored = useMemo(() => {
    if (!partition || !step) return null;
    const byDepth = levelsByDepth(partition);
    const deepest = byDepth[byDepth.length - 1];
    if (deepest === undefined) return null;
    const ours = new Map<string, string>();
    step.membership.forEach((community, node) => ours.set(run.order[node], String(community)));
    const theirs = new Map<string, string>();
    for (const [id, community] of assignmentAtLevel(partition, deepest)) if (ours.has(id)) theirs.set(id, community);
    if (theirs.size === 0) return null;
    return compareAssignments(ours, theirs);
  }, [partition, step, run]);

  const last = run.steps[run.steps.length - 1];
  const peak = Math.max(...run.steps.map((s) => s.modularity), 0.0001);

  return (
    <section className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-controls">
          <label className="control">{t("Run on")}
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="all">{t("the whole index ({n} entities)", { n: fmt(dataset.entities.size) })}</option>
              <option value="top">{t("the {n} best connected entities", { n: fmt(TOP_NODES) })}</option>
              {selected && <option value="community">{t("{title} only", { title: selected.title })}</option>}
            </select>
          </label>
          <label className="control">{t("Resolution")}
            <select value={resolution} onChange={(e) => setResolution(Number(e.target.value))}>
              {[0.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="control">{t("Seed")}
            <input className="field seed" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
          </label>
        </div>
        <div className="graph-controls">
          <button className="btn" onClick={() => { setIndex(0); setPlaying(false); }} title={t("Back to the start")}>⏮</button>
          <button className="btn" onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }}>◀</button>
          <button className="btn primary" onClick={() => setPlaying((p) => !p)}>{playing ? t("Pause") : t("Play")}</button>
          <button className="btn" onClick={() => { setPlaying(false); setIndex((i) => Math.min(run.steps.length - 1, i + 1)); }}>▶</button>
          <label className="control">{t("Speed")}
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((entry, i) => <option key={entry.label} value={i}>{entry.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="formation-bar">
        <input
          type="range" min={0} max={Math.max(0, run.steps.length - 1)} value={Math.min(index, run.steps.length - 1)}
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }} aria-label={t("Step")}
        />
        <span className="formation-count">{t("step {index} of {total}", { index: Math.min(index, run.steps.length - 1) + 1, total: run.steps.length })}</span>
      </div>

      <div className="formation">
        <div className="graph-canvas-wrap" ref={wrap}>
          <div className="graph-canvas" ref={host} />
        </div>
        <aside className="formation-side">
          <div className={`phase phase-${step?.phase}`}>
            <span className="phase-name">{t(phaseLabel(step?.phase))}</span>
            <span className="phase-round">{t("round {round}", { round: (step?.round ?? 0) + 1 })}{step?.phase === "moving" ? t(", sweep {pass}", { pass: step.pass }) : ""}</span>
          </div>
          <p className="muted">{t(PHASE_TEXT[step?.phase ?? "start"])}</p>
          <dl className="formation-stats">
            <dt>{t("Communities")}</dt><dd className="num">{fmt(step?.communities ?? 0)}</dd>
            <dt>{t("Modularity")}</dt><dd className="num">{(step?.modularity ?? 0).toFixed(3)}</dd>
            <dt>{t("Entities that moved")}</dt><dd className="num">{fmt(step?.moved ?? 0)}</dd>
            <dt>{t("Working graph")}</dt><dd className="num">{fmt(step?.workNodes ?? 0)} / {fmt(step?.workEdges ?? 0)}</dd>
          </dl>
          <svg className="formation-chart" viewBox={`0 0 ${Math.max(run.steps.length - 1, 1) * 8} 60`} preserveAspectRatio="none" role="img" aria-label={t("Modularity per step")}>
            <polyline
              fill="none" stroke="#3d5afe" strokeWidth={1.5}
              points={run.steps.map((s, i) => `${i * 8},${58 - (s.modularity / peak) * 54}`).join(" ")}
            />
            <line x1={Math.min(index, run.steps.length - 1) * 8} y1={0} x2={Math.min(index, run.steps.length - 1) * 8} y2={60} stroke="#9a4a06" strokeWidth={1} />
          </svg>
          <p className="muted">
            {t("{steps} steps in {ms} ms on {nodes} entities and {edges} relationships. Final modularity {q}, {communities} communities over {levels} levels.", {
              steps: fmt(run.steps.length), ms: run.ms.toFixed(0), nodes: fmt(run.graph.n), edges: fmt(run.graph.offsets[run.graph.n] / 2),
              q: (last?.modularity ?? 0).toFixed(3), communities: fmt(last?.communities ?? 0), levels: fmt(run.result.levels.length),
            })}
          </p>
          {stored && (
            <p className="muted">
              {t("Against the loaded community set at this step: NMI {nmi}, ARI {ari}.", { nmi: stored.nmi.toFixed(3), ari: stored.ari.toFixed(3) })}
            </p>
          )}
          <p className="note">{t("Leiden is run in this browser on the entities above; the loaded communities are never changed.")}</p>
        </aside>
      </div>
    </section>
  );
}

function phaseLabel(phase: LeidenStep["phase"] | undefined): string {
  switch (phase) {
    case "moving": return "Local moving";
    case "refinement": return "Refinement";
    case "aggregation": return "Aggregation";
    case "done": return "Done";
    default: return "Start";
  }
}
