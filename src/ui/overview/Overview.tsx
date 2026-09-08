import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { LoadResult } from "../../core/loaders/graphrag";
import { checkIntegrity } from "../../core/metrics/integrity";
import { datasetCounts, summarizePartition } from "../../core/metrics/summary";
import type { GraphFocus, GraphMode } from "../graph/CommunityGraph";
import { displayTitle } from "../../core/graph/palette";

// Heavy views (Cytoscape) load on demand so the overview appears before the graph code downloads.
const CommunityGraph = lazy(() => import("../graph/CommunityGraph").then((m) => ({ default: m.CommunityGraph })));
const CommunityMap = lazy(() => import("../map/CommunityMap").then((m) => ({ default: m.CommunityMap })));
const QualityView = lazy(() => import("../quality/QualityView").then((m) => ({ default: m.QualityView })));

type View = "table" | "map" | "graph" | "quality";
const VIEWS: View[] = ["table", "map", "graph", "quality"];

/** #view=map&set=leiden&community=11 makes the current screen shareable; ?data= stays in the query. */
function readHash(): { view?: View; set?: string; community?: string; entity?: string } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const view = params.get("view") as View | null;
  return { view: view && VIEWS.includes(view) ? view : undefined, set: params.get("set") ?? undefined, community: params.get("community") ?? undefined, entity: params.get("entity") ?? undefined };
}
import { Mark } from "../Mark";
import { LangToggle, Rich, useT } from "../i18n";
import { fmt, pct } from "../format";
import { CommunityTable } from "./CommunityTable";
import { HierarchyTree } from "./HierarchyTree";
import { Inspector } from "./Inspector";
import { IntegrityPanel } from "./IntegrityPanel";

interface Props {
  result: LoadResult;
  label: string;
  onReset: () => void;
}

export function Overview({ result, label, onReset }: Props) {
  const { t } = useT();
  const { dataset, notes } = result;
  const [initial] = useState(readHash);
  const [partitionId, setPartitionId] = useState(() => (initial.set && dataset.partitions.some((p) => p.id === initial.set) ? initial.set : dataset.partitions[0]?.id ?? ""));
  const [selectedId, setSelectedId] = useState<string | null>(() => initial.community ?? null);
  const [view, setView] = useState<View>(() => (initial.view === "graph" && !initial.community && !initial.entity ? "table" : initial.view ?? "table"));
  const [mapExpanded, setMapExpanded] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<GraphFocus>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [graphMode, setGraphMode] = useState<GraphMode>(() => (initial.entity && dataset.entities.has(initial.entity) ? { kind: "neighborhood", entityId: initial.entity, hops: 2 } : { kind: "communities" }));
  const partition = dataset.partitions.find((p) => p.id === partitionId) ?? dataset.partitions[0];

  const counts = useMemo(() => datasetCounts(dataset), [dataset]);
  const summary = useMemo(() => (partition ? summarizePartition(dataset, partition) : null), [dataset, partition]);
  const integrity = useMemo(() => (partition ? checkIntegrity(dataset, partition) : []), [dataset, partition]);

  const levels = partition?.levels ?? [];
  const selected = selectedId && partition ? partition.communities.get(selectedId) ?? null : null;
  const graphIds = useMemo(() => (selectedId ? [selectedId, ...extraIds.filter((id) => id !== selectedId)] : []), [selectedId, extraIds]);

  // Every view or selection change is a history entry, so the browser's back button walks the trail.
  // After a popstate the URL already matches the restored state, so nothing is pushed twice.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "table") params.set("view", view);
    if (partition && dataset.partitions.length > 1) params.set("set", partition.id);
    if (selectedId) params.set("community", selectedId);
    if (graphMode.kind === "neighborhood") params.set("entity", graphMode.entityId);
    const hash = params.toString();
    const target = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (target !== current) window.history.pushState(null, "", target);
  }, [view, partition, selectedId, graphMode, dataset]);

  useEffect(() => {
    const onPop = () => {
      const h = readHash();
      setPartitionId(h.set && dataset.partitions.some((p) => p.id === h.set) ? h.set : dataset.partitions[0]?.id ?? "");
      setSelectedId(h.community ?? null);
      setExtraIds([]);
      if (h.entity && dataset.entities.has(h.entity)) {
        setGraphMode({ kind: "neighborhood", entityId: h.entity, hops: 2 });
        setFocus({ kind: "entity", id: h.entity });
      } else {
        setGraphMode({ kind: "communities" });
        setFocus(null);
      }
      setView(h.view === "graph" && !h.community && !h.entity ? "table" : h.view ?? "table");
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

  return (
    <div className="app">
      <header className="topbar">
        <Mark size={22} />
        <span className="topbar-title">GraphRAG Community Explorer</span>
        <span className="topbar-dataset" title={dataset.source.files.join(", ")}>
          {label}: {dataset.source.files.join(", ")}
        </span>
        {dataset.partitions.length > 1 && (
          <select aria-label={t("Community set")} value={partition?.id} onChange={(e) => changePartition(e.target.value)}>
            {dataset.partitions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.communities.size})
              </option>
            ))}
          </select>
        )}
        <LangToggle />
        <button className="btn" onClick={onReset}>{t("Open another dataset")}</button>
      </header>

      <aside className="rail">
        <section className="rail-section">
          <h2>{t("Dataset")}</h2>
          <dl>
            <dt>{t("Source")}</dt>
            <dd>{dataset.source.kind === "age-export" ? t("Apache AGE export") : t("GraphRAG output")}</dd>
            <dt>{t("Entity types")}</dt>
            <dd>{counts.entityTypes.size}</dd>
            <dt>{t("Relationship types")}</dt>
            <dd>{counts.relationshipTypes.size}</dd>
          </dl>
        </section>
        {partition ? (
          <HierarchyTree partition={partition} selectedId={selectedId} onSelect={select} />
        ) : (
          <section className="rail-section muted">{t("No communities.parquet was loaded, so there is no hierarchy to show.")}</section>
        )}
      </aside>

      <main className={`main${view === "map" || view === "graph" ? " graph-mode" : ""}`}>
        <div className="main-head">
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={view === "table"} className={view === "table" ? "active" : ""} onClick={() => setView("table")}>{t("Overview")}</button>
            <button role="tab" aria-selected={view === "map"} className={view === "map" ? "active" : ""} disabled={!partition} onClick={() => setView("map")}>{t("Map")}</button>
            <button role="tab" aria-selected={view === "quality"} className={view === "quality" ? "active" : ""} disabled={!partition} onClick={() => setView("quality")}>{t("Quality")}</button>
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
        {view === "quality" && partition ? (
          <QualityView dataset={dataset} partition={partition} selectedId={selectedId} onSelect={select} />
        ) : view === "map" && partition ? (
          <CommunityMap
            dataset={dataset}
            partition={partition}
            expanded={mapExpanded}
            onExpandedChange={setMapExpanded}
            selectedId={selectedId}
            onSelect={select}
            focus={focus}
            onFocus={setFocus}
          />
        ) : view === "graph" && partition && (selected || graphMode.kind === "neighborhood") ? (
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
          />
        ) : (
          <>
            <p className="summary">
              <Rich text="**{entities}** entities and **{relationships}** relationships." vars={{ entities: fmt(counts.entities), relationships: fmt(counts.relationships) }} />{" "}
              {partition && summary ? (
                <Rich
                  text="**{communities}** communities on **{levels}** level{s}{range}; **{covered}** entities ({coverage}) belong to at least one{multi}."
                  vars={{
                    communities: fmt(partition.communities.size),
                    levels: levels.length,
                    s: levels.length === 1 ? "" : "s",
                    range: levels.length > 0 ? ` (L${levels[0]}${levels.length > 1 ? `\u2013L${levels[levels.length - 1]}` : ""})` : "",
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

            {partition && summary && (
              <CommunityTable partition={partition} metrics={summary.metrics} selectedId={selectedId} onSelect={select} />
            )}
          </>
        )}
        </Suspense>
      </main>

      <aside className="inspector">
        <Inspector
          dataset={dataset}
          partition={partition ?? null}
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
          onToggleMap={() => {
            if (!selectedId) return;
            const next = new Set(mapExpanded);
            if (next.has(selectedId)) next.delete(selectedId);
            else next.add(selectedId);
            setMapExpanded(next);
          }}
        />
      </aside>
    </div>
  );
}
