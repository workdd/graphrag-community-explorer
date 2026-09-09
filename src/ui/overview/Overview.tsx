import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { LoadResult } from "../../core/loaders/graphrag";
import type { DatasetRef } from "../../core/loaders/files";
import { checkIntegrity } from "../../core/metrics/integrity";
import { datasetCounts, summarizePartition } from "../../core/metrics/summary";
import type { GraphFocus, GraphMode } from "../graph/CommunityGraph";
import { displayTitle } from "../../core/graph/palette";
import { nestingRatio } from "../../core/graph/map";
import { schemaGraph, selectTriple, selectType, type SchemaSelection, type SchemaTripleEdge } from "../../core/graph/schemaGraph";
import { depthOfLevel, levelsByDepth, pathTo } from "../../core/hierarchy";
import type { Dataset, Partition } from "../../core/model";
import { Mark } from "../Mark";
import { LangToggle, Rich, useT } from "../i18n";
import { fmt, pct } from "../format";
import { CommunityTable } from "./CommunityTable";
import { version as APP_VERSION } from "../../../package.json";
import { EntityFinder } from "./EntityFinder";
import { Inspector } from "./Inspector";
import { IntegrityPanel } from "./IntegrityPanel";

// Heavy views (Cytoscape) load on demand so the overview appears before the graph code downloads.
const CommunityGraph = lazy(() => import("../graph/CommunityGraph").then((m) => ({ default: m.CommunityGraph })));
const CommunityMap = lazy(() => import("../map/CommunityMap").then((m) => ({ default: m.CommunityMap })));
const QualityView = lazy(() => import("../quality/QualityView").then((m) => ({ default: m.QualityView })));
const SchemaView = lazy(() => import("../schema/SchemaView").then((m) => ({ default: m.SchemaView })));
const SearchView = lazy(() => import("../search/SearchView").then((m) => ({ default: m.SearchView })));
const FormationView = lazy(() => import("../formation/FormationView").then((m) => ({ default: m.FormationView })));
const NetworkView = lazy(() => import("../network/NetworkView").then((m) => ({ default: m.NetworkView })));
const MatrixView = lazy(() => import("../matrix/MatrixView").then((m) => ({ default: m.MatrixView })));
const CommunityBands = lazy(() => import("../map/CommunityBands").then((m) => ({ default: m.CommunityBands })));

type View = "network" | "table" | "map" | "graph" | "quality" | "schema" | "formation" | "ask" | "matrix";
const VIEWS: View[] = ["network", "table", "map", "graph", "quality", "schema", "formation", "ask", "matrix"];
/** The shape of the index comes first; every other view is reached by picking something in it. */
const DEFAULT_VIEW: View = "schema";
type Backgrounds = "boxes" | "clouds";

interface HashState {
  view: View;
  set: string;
  community: string | null;
  entity: string | null;
  open: string[];
  hops: number;
}

/**
 * #view=map&set=leiden&community=11&open=1,4&entity=…&hops=3 makes the current screen shareable; ?data= stays in
 * the query. Ids that the loaded dataset does not know (a link made from another index) are dropped rather than
 * shown as broken, and views that need communities fall back to the overview when there are none.
 */
function readHash(dataset: Dataset): HashState {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const set = params.get("set");
  const setId = set && dataset.partitions.some((p) => p.id === set) ? set : dataset.partitions[0]?.id ?? "";
  const partition = dataset.partitions.find((p) => p.id === setId);
  const rawCommunity = params.get("community");
  const community = rawCommunity && partition?.communities.has(rawCommunity) ? rawCommunity : null;
  const rawEntity = params.get("entity");
  const entity = rawEntity && dataset.entities.has(rawEntity) ? rawEntity : null;
  const open = (params.get("open") ?? "").split(",").filter((id) => partition?.communities.has(id) || id === "unassigned");
  const hops = Number(params.get("hops"));
  const rawView = params.get("view") as View | null;
  let view: View = rawView && VIEWS.includes(rawView) ? rawView : DEFAULT_VIEW;
  if (view === "graph" && !community && !entity) view = DEFAULT_VIEW;
  if ((view === "map" || view === "quality") && !partition) view = DEFAULT_VIEW;
  return { view, set: setId, community, entity, open, hops: [1, 2, 3].includes(hops) ? hops : 2 };
}

/** Stand-in for indexes shipped without communities.parquet: the graph still works around an entity. */
const EMPTY_PARTITION: Partition = { id: "none", label: "none", communities: new Map(), levels: [], rootLevel: 0 };

type Spotlight = SchemaSelection | null;

interface Props {
  result: LoadResult;
  label: string;
  onReset: () => void;
  datasets: DatasetRef[];
  activeData?: string;
  onOpenDataset: (path: string) => void;
}

export function Overview({ result, label, onReset, datasets, activeData, onOpenDataset }: Props) {
  const { t } = useT();
  const { dataset, notes } = result;
  const [initial] = useState(() => readHash(dataset));
  const [partitionId, setPartitionId] = useState(initial.set);
  const [selectedId, setSelectedId] = useState<string | null>(initial.community);
  const [view, setView] = useState<View>(initial.view);
  const [mapExpanded, setMapExpanded] = useState<Set<string>>(() => new Set(initial.open));
  const [mapBackgrounds, setMapBackgrounds] = useState<Backgrounds>("boxes");
  // The whole community set at a glance comes first; the box map is for drilling into one of them.
  const [mapMode, setMapMode] = useState<"bands" | "boxes">("bands");
  const [focus, setFocus] = useState<GraphFocus>(() => (initial.entity ? { kind: "entity", id: initial.entity } : null));
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [graphMode, setGraphMode] = useState<GraphMode>(() => (initial.entity ? { kind: "neighborhood", entityId: initial.entity, hops: initial.hops } : { kind: "communities" }));
  const realPartition = dataset.partitions.find((p) => p.id === partitionId) ?? dataset.partitions[0];
  const partition = realPartition ?? EMPTY_PARTITION;
  // Only a properly nested hierarchy can open a community inside its parents on the map.
  const nested = useMemo(() => nestingRatio(partition) >= 0.9, [partition]);
  const schema = useMemo(() => schemaGraph(dataset), [dataset]);
  // A slice of the schema carried into the data views, so a type or a triple can be followed through.
  const [spotlight, setSpotlight] = useState<Spotlight>(null);
  const [pair, setPair] = useState<{ from: string; to: string } | null>(null);
  const [networkSeed, setNetworkSeed] = useState<string | null>(null);
  // One record is the way in: the graph centres on it and keeps the rest of its neighbours counted.
  const openRecord = (entityId: string) => {
    setNetworkSeed(entityId);
    setFocus({ kind: "entity", id: entityId });
    setView("network");
  };
  // A dense triple is unreadable as arrows, so picking one opens the grid instead of the graph.
  const openMatrix = (from: string, to: string) => {
    setPair({ from, to });
    setView("matrix");
  };
  const openType = (type: string) => {
    setSpotlight(selectType(schema, type));
    setFocus(null);
    setView("network");
  };
  const openTriple = (edge: SchemaTripleEdge) => {
    setSpotlight(selectTriple(edge));
    setFocus(null);
    setView("network");
  };
  const ancestorsOf = (ids: string[]) => ids.flatMap((id) => pathTo(partition, id).slice(0, -1).map((c) => c.id));

  const counts = useMemo(() => datasetCounts(dataset), [dataset]);
  const summary = useMemo(() => (realPartition ? summarizePartition(dataset, realPartition) : null), [dataset, realPartition]);
  const integrity = useMemo(() => (realPartition ? checkIntegrity(dataset, realPartition) : []), [dataset, realPartition]);

  const levels = realPartition ? levelsByDepth(realPartition) : [];
  const selected = selectedId && realPartition ? realPartition.communities.get(selectedId) ?? null : null;
  const graphIds = useMemo(() => (selectedId ? [selectedId, ...extraIds.filter((id) => id !== selectedId)] : []), [selectedId, extraIds]);

  // Every view or selection change is a history entry, so the browser's back button walks the trail.
  // After a popstate the URL already matches the restored state, so nothing is pushed twice.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== DEFAULT_VIEW) params.set("view", view);
    if (realPartition && dataset.partitions.length > 1) params.set("set", realPartition.id);
    if (selectedId) params.set("community", selectedId);
    if (graphMode.kind === "neighborhood") {
      params.set("entity", graphMode.entityId);
      if (graphMode.hops !== 2) params.set("hops", String(graphMode.hops));
    }
    if (mapExpanded.size > 0) params.set("open", [...mapExpanded].join(","));
    const hash = params.toString().replace(/%2C/g, ",");
    const target = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (target !== current) window.history.pushState(null, "", target);
  }, [view, realPartition, selectedId, graphMode, mapExpanded, dataset]);

  useEffect(() => {
    const onPop = () => {
      const h = readHash(dataset);
      setPartitionId(h.set);
      setSelectedId(h.community);
      setExtraIds([]);
      setMapExpanded(new Set(h.open));
      if (h.entity) {
        setGraphMode({ kind: "neighborhood", entityId: h.entity, hops: h.hops });
        setFocus({ kind: "entity", id: h.entity });
      } else {
        setGraphMode({ kind: "communities" });
        setFocus(null);
      }
      setView(h.view);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dataset]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setFocus(null);
    setExtraIds([]);
    setGraphMode({ kind: "communities" });
  };
  const explore = (entityId: string) => {
    setGraphMode({ kind: "neighborhood", entityId, hops: 2 });
    setFocus({ kind: "entity", id: entityId });
    setView("graph");
  };
  const seedTitle = graphMode.kind === "neighborhood" ? dataset.entities.get(graphMode.entityId) : undefined;
  const changePartition = (id: string) => {
    setPartitionId(id);
    select(null);
    setMapExpanded(new Set());
    setView("table");
  };
  const openGraph = () => {
    if (selectedId) setView("graph");
  };
  const addCommunity = (id: string) => {
    setExtraIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setView("graph");
  };
  // The paper's upper plane: the graph's communities become nodes inside their opened parents.
  const showOnMap = (ids: string[]) => {
    setMapExpanded(new Set(nested ? ancestorsOf(ids) : []));
    setMapBackgrounds("clouds");
    // Select the most specific community of the graph, not one of the ancestors it sits in.
    const deepest = [...ids].sort((a, b) => (partition.communities.get(b)?.level ?? -1) - (partition.communities.get(a)?.level ?? -1))[0];
    if (deepest) setSelectedId(deepest);
    setFocus(null);
    setView("map");
  };
  // Opening a community whose parent is closed would draw nothing, so its ancestors open with it.
  const toggleInMap = () => {
    if (!selectedId) return;
    const next = new Set(mapExpanded);
    if (next.has(selectedId)) next.delete(selectedId);
    else {
      next.add(selectedId);
      if (nested) ancestorsOf([selectedId]).forEach((id) => next.add(id));
    }
    setMapExpanded(next);
  };

  return (
    // The Ask tab reads its own records beside the answer, so the community inspector would sit
    // there repeating a prompt about a selection this view does not make. It gives up its column.
    <div className={`app no-rail${view === "ask" ? " no-inspector" : ""}`}>
      <header className="topbar">
        <Mark size={22} />
        <span className="topbar-title">GraphRAG Community Explorer</span>
        <span className="topbar-dataset" title={dataset.source.files.join(", ")}>
          {label}: {dataset.source.files.join(", ")}
        </span>
        {datasets.length > 1 && (
          <select aria-label={t("Dataset")} value={activeData ?? ""} onChange={(e) => onOpenDataset(e.target.value)}>
            {activeData === undefined && <option value="">{label}</option>}
            {datasets.map((d) => (
              <option key={d.path} value={d.path}>{d.label}</option>
            ))}
          </select>
        )}
        {dataset.partitions.length > 1 && (
          <select aria-label={t("Community set")} value={realPartition?.id} onChange={(e) => changePartition(e.target.value)}>
            {dataset.partitions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.communities.size})
              </option>
            ))}
          </select>
        )}
        <EntityFinder dataset={dataset} onExplore={openRecord} />
        <LangToggle />
        <button className="btn" onClick={onReset}>{t("Open another dataset")}</button>
      </header>


      <main className={`main${view === "map" || view === "graph" || view === "network" || view === "formation" || view === "matrix" ? " graph-mode" : ""}`}>
        <div className="main-head">
          {view === "map" && (
            <label className="control head-control">{t("View")}
              <select value={mapMode} onChange={(event) => setMapMode(event.target.value as "bands" | "boxes")}>
                <option value="bands">{t("all communities by level")}</option>
                <option value="boxes">{t("nested boxes with members")}</option>
              </select>
            </label>
          )}
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={view === "network"} className={view === "network" ? "active" : ""} title={t("Every entity and relationship; communities are an overlay you turn on")} onClick={() => setView("network")}>{t("Network")}</button>
            <button role="tab" aria-selected={view === "table"} className={view === "table" ? "active" : ""} onClick={() => setView("table")}>{t("Overview")}</button>
            <button role="tab" aria-selected={view === "map"} className={view === "map" ? "active" : ""} disabled={!realPartition} title={realPartition ? undefined : t("Needs communities.parquet")} onClick={() => setView("map")}>{t("Communities")}</button>
            <button role="tab" aria-selected={view === "quality"} className={view === "quality" ? "active" : ""} disabled={!realPartition} title={realPartition ? undefined : t("Needs communities.parquet")} onClick={() => setView("quality")}>{t("Quality")}</button>
            <button role="tab" aria-selected={view === "schema"} className={view === "schema" ? "active" : ""} title={t("The tables behind the graph and the rows behind the selection")} onClick={() => setView("schema")}>{t("Schema")}</button>
            <button role="tab" aria-selected={view === "matrix"} className={view === "matrix" ? "active" : ""} disabled={schema.edges.length === 0} title={t("Two entity types as a grid, which is the readable form of a dense block")} onClick={() => openMatrix(pair?.from ?? schema.edges[0].from, pair?.to ?? schema.edges[0].to)}>{t("Matrix")}</button>
            <button role="tab" aria-selected={view === "formation"} className={view === "formation" ? "active" : ""} title={t("Run Leiden here and watch the communities form")} onClick={() => setView("formation")}>{t("Formation")}</button>
            <button role="tab" aria-selected={view === "ask"} className={view === "ask" ? "active" : ""} title={t("Ask a question and follow the answer back to the records it cites")} onClick={() => setView("ask")}>{t("Ask")}</button>
            <button
              role="tab"
              aria-selected={view === "graph"}
              className={view === "graph" ? "active" : ""}
              disabled={!selected && graphMode.kind !== "neighborhood"}
              title={selected || graphMode.kind === "neighborhood" ? undefined : t("Select a community first")}
              onClick={() => (selected || graphMode.kind === "neighborhood") && setView("graph")}
            >
              {t("Graph")}{seedTitle ? `: ${displayTitle(seedTitle)}` : selected ? `: ${selected.title}` : ""}
            </button>
          </div>
        </div>

        <Suspense fallback={<div className="view-loading">{t("Loading view…")}</div>}>
        {view === "ask" ? (
          <SearchView
            dataset={dataset}
            partition={realPartition ?? null}
            embeddings={result.embeddings}
            embeddingsNote={result.embeddingsNote}
            exampleRun={result.exampleRun}
            fingerprints={result.fingerprints ?? {}}
            label={label}
            version={APP_VERSION}
            onOpenCommunity={(id) => { select(id); setView("table"); }}
            onOpenEntity={explore}
          />
        ) : view === "matrix" && pair ? (
          <MatrixView
            dataset={dataset}
            pair={pair}
            onPair={setPair}
            onFocusEntity={(id) => setFocus({ kind: "entity", id })}
            onExplore={explore}
          />
        ) : view === "network" ? (
          <NetworkView
            dataset={dataset}
            partition={realPartition ?? null}
            focus={focus}
            onFocus={setFocus}
            selectedCommunityId={selectedId}
            onSelectCommunity={(id) => { setSelectedId(id); setFocus(null); setExtraIds([]); setGraphMode({ kind: "communities" }); }}
            onExplore={explore}
            spotlight={spotlight}
            onOpenCommunityGraph={(id) => { select(id); setView("graph"); }}
            onClearSpotlight={() => setSpotlight(null)}
            onSpotlight={setSpotlight}
            seed={networkSeed}
            onSeed={setNetworkSeed}
          />
        ) : view === "formation" ? (
          <FormationView dataset={dataset} partition={realPartition ?? null} selected={selected} spotlight={spotlight} onFocus={setFocus} />
        ) : view === "schema" ? (
          <SchemaView dataset={dataset} partition={realPartition ?? null} tables={result.tables} selectedId={selectedId} focus={focus} onSelect={select} onFocus={setFocus} onOpenGraph={openGraph} onOpenType={openType} onOpenTriple={openTriple} onOpenMatrix={openMatrix} onExplore={explore} />
        ) : view === "quality" && realPartition ? (
          <QualityView dataset={dataset} partition={realPartition} selectedId={selectedId} onSelect={select} />
        ) : view === "map" && realPartition && mapMode === "bands" ? (
          <CommunityBands
            dataset={dataset}
            partition={realPartition}
            selectedId={selectedId}
            onSelect={select}
            onOpenGraph={(id) => { select(id); setView("graph"); }}
          />
        ) : view === "map" && realPartition ? (
          <CommunityMap
            dataset={dataset}
            partition={realPartition}
            expanded={mapExpanded}
            onExpandedChange={setMapExpanded}
            selectedId={selectedId}
            onSelect={select}
            focus={focus}
            onFocus={setFocus}
            backgrounds={mapBackgrounds}
            onBackgroundsChange={setMapBackgrounds}
          />
        ) : view === "graph" && (selected || graphMode.kind === "neighborhood") ? (
          <CommunityGraph
            dataset={dataset}
            partition={partition}
            communityIds={graphIds}
            focus={focus}
            onFocus={setFocus}
            onRemoveCommunity={(id) => setExtraIds((prev) => prev.filter((x) => x !== id))}
            mode={graphMode}
            onHopsChange={(hops) => setGraphMode((m) => (m.kind === "neighborhood" ? { ...m, hops } : m))}
            onLeaveNeighborhood={() => { setGraphMode({ kind: "communities" }); if (!selectedId) setView("table"); }}
            onShowOnMap={showOnMap}
          />
        ) : (
          <>
            <p className="summary">
              <Rich text="**{entities}** entities and **{relationships}** relationships." vars={{ entities: fmt(counts.entities), relationships: fmt(counts.relationships) }} />{" "}
              {realPartition && summary ? (
                <Rich
                  text="**{communities}** communities on **{levels}** level{s}{range}; **{covered}** entities ({coverage}) belong to at least one{multi}."
                  vars={{
                    communities: fmt(realPartition.communities.size),
                    levels: levels.length,
                    s: levels.length === 1 ? "" : "s",
                    range: levels.length > 0 && realPartition ? ` (L${depthOfLevel(realPartition, levels[0])}${levels.length > 1 ? `–L${depthOfLevel(realPartition, levels[levels.length - 1])}` : ""})` : "",
                    covered: fmt(summary.coveredEntities),
                    coverage: pct(summary.coverage),
                    multi: summary.multiMembership > 0 ? t(", **{n}** to more than one on the same level", { n: fmt(summary.multiMembership) }) : "",
                  }}
                />
              ) : (
                t("No community set loaded.")
              )}
              {counts.isolatedEntities > 0 && <Rich text=" **{isolated}** entities have no relationships." vars={{ isolated: fmt(counts.isolatedEntities) }} />}
            </p>

            <IntegrityPanel notes={notes} findings={integrity} />

            {realPartition && summary ? (
              <CommunityTable partition={realPartition} metrics={summary.metrics} selectedId={selectedId} onSelect={select} />
            ) : (
              <p className="muted">{t("No communities.parquet was loaded. Find an entity in the Network view and open its neighbourhood; the map and quality views need communities.")}</p>
            )}
          </>
        )}
        </Suspense>
      </main>

      {view === "ask" ? null : (
      <aside className="inspector">
        <Inspector
          dataset={dataset}
          partition={realPartition ?? null}
          community={selected}
          metrics={summary?.metrics}
          focus={focus}
          onFocus={setFocus}
          onSelect={select}
          onOpenGraph={openGraph}
          inGraph={view === "graph"}
          graphIds={graphIds}
          onAddCommunity={addCommunity}
          onExplore={explore}
          inMap={view === "map"}
          mapOpen={selectedId !== null && mapExpanded.has(selectedId)}
          onToggleMap={toggleInMap}
        />
      </aside>
      )}
    </div>
  );
}
