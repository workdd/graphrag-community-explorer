import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { UNASSIGNED_ID, buildMapModel, communityKey, entityKey, nestingRatio } from "../../core/graph/map";
import { typeColors } from "../../core/graph/palette";
import { hashText } from "../../core/graph/seed";
import { pathTo } from "../../core/hierarchy";
import type { Dataset, Partition } from "../../core/model";
import { exportCytoscapePng } from "../download";
import { fmt } from "../format";
import { Rich, useT } from "../i18n";
import type { GraphFocus } from "../graph/CommunityGraph";
import { loadCachedLayout, requestLayout, saveCachedLayout } from "../graph/layoutClient";
import { MAP_STYLE } from "../graph/style";
import { attachClouds, cloudColors } from "../graph/clouds";
import { buildMapElements, layoutInput, type Positions } from "./mapElements";

interface Props {
  dataset: Dataset;
  partition: Partition;
  expanded: Set<string>;
  onExpandedChange: (next: Set<string>) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  focus: GraphFocus;
  onFocus: (focus: GraphFocus) => void;
  backgrounds: "boxes" | "clouds";
  onBackgroundsChange: (next: "boxes" | "clouds") => void;
}

const ENTITY_BUDGETS = [300, 800, 1500];

type LayoutStatus = { status: "idle" | "running" } | { status: "ready"; ms: number; where: "worker" | "main" | "cache" };

export function CommunityMap(props: Props) {
  const { t } = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const { dataset, partition, expanded, onExpandedChange, selectedId, focus, backgrounds, onBackgroundsChange } = props;
  const [baseLevel, setBaseLevel] = useState<number | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [maxEntities, setMaxEntities] = useState(800);
  const backgroundsRef = useRef(backgrounds);
  const selectFromCanvas = useRef(false);
  backgroundsRef.current = backgrounds;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const [layout, setLayout] = useState<LayoutStatus>({ status: "idle" });
  const [ready, setReady] = useState<{ signature: string; positions: Positions } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; detail: string } | null>(null);
  const [picked, setPicked] = useState<{ a: string; b: string; count: number } | null>(null);

  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);
  const positionsRef = useRef<Positions>({});
  const propsRef = useRef(props);
  propsRef.current = props;

  const nested = useMemo(() => nestingRatio(partition) >= 0.9, [partition]);
  const model = useMemo(
    () => buildMapModel(dataset, partition, { baseLevel, expanded, showUnassigned, maxEntities }),
    [dataset, partition, baseLevel, expanded, showUnassigned, maxEntities],
  );
  // A community picked in the tree or the inspector may sit inside a closed parent or on another level.
  const hiddenSelection = useMemo(() => {
    const community = selectedId ? partition.communities.get(selectedId) : undefined;
    return community && !model.communities.some((c) => c.community.id === selectedId) ? community : null;
  }, [selectedId, partition, model]);
  const revealSelection = () => {
    if (!hiddenSelection) return;
    if (baseLevel === null) onExpandedChange(new Set([...expanded, ...pathTo(partition, hiddenSelection.id).slice(0, -1).map((c) => c.id)]));
    else setBaseLevel(hiddenSelection.level);
  };

  const colors = useMemo(() => typeColors(model.entities.map((e) => e.entity.type)), [model]);
  const unassignedLabel = t("Not in any community");
  const elements = useMemo(() => buildMapElements(model, partition, colors, positionsRef.current, { unassigned: unassignedLabel }), [model, partition, colors, unassignedLabel]);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const signature = useMemo(() => elements.map((e) => e.data.id).join(","), [elements]);
  const cacheKey = useMemo(
    () => `map:${hashText(`${partition.id}|${dataset.entities.size}|${dataset.relationships.length}|${nonce}|${signature}`)}`,
    [partition.id, dataset, nonce, signature],
  );

  // Positions come from the cache when the same picture was computed before, otherwise from the worker.
  useEffect(() => {
    let cancelled = false;
    const nodeIds = elements.filter((e) => e.group === "nodes" && !String(e.classes ?? "").includes("container")).map((e) => e.data.id as string);
    (async () => {
      const cached = await loadCachedLayout(cacheKey);
      if (cancelled) return;
      if (cached && nodeIds.every((id) => cached[id])) {
        positionsRef.current = { ...positionsRef.current, ...cached };
        setReady({ signature, positions: cached });
        setLayout({ status: "ready", ms: 0, where: "cache" });
        return;
      }
      setLayout({ status: "running" });
      const known = nodeIds.filter((id) => positionsRef.current[id]).length;
      const incremental = nodeIds.length > 0 && known / nodeIds.length >= 0.7;
      const result = await requestLayout("map", layoutInput(elements), incremental, cacheKey);
      if (cancelled) return;
      positionsRef.current = { ...positionsRef.current, ...result.positions };
      void saveCachedLayout(cacheKey, result.positions);
      setReady({ signature, positions: result.positions });
      setLayout({ status: "ready", ms: result.ms, where: result.where });
      if (import.meta.env.DEV) console.info(`[map] ${nodeIds.length} nodes, layout ${Math.round(result.ms)} ms in ${result.where}${incremental ? " (incremental)" : ""}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [elements, signature, cacheKey]);

  const toggle = (id: string) => {
    const next = new Set(propsRef.current.expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    propsRef.current.onExpandedChange(next);
  };

  // The canvas is rebuilt only once positions for the current element set exist, so it never shows a half-laid-out picture.
  useEffect(() => {
    const current = elementsRef.current;
    const currentSignature = current.map((e) => e.data.id).join(",");
    if (!host.current || !ready || ready.signature !== currentSignature) return;
    const placed = current.map((el) => (el.group === "nodes" && ready.positions[el.data.id as string] ? { ...el, position: ready.positions[el.data.id as string] } : el));
    const cy = cytoscape({
      container: host.current,
      elements: placed,
      style: MAP_STYLE,
      layout: { name: "preset" },
      minZoom: 0.03,
      maxZoom: 6,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    cy.fit(cy.elements(), 40);

    cy.on("tap", "node.collapsed, node.container", (event) => {
      const id = event.target.data("communityId") as string;
      setPicked(null);
      selectFromCanvas.current = true;
      if (id !== UNASSIGNED_ID) propsRef.current.onSelect(id);
    });
    cy.on("dbltap", "node.collapsed, node.container", (event) => toggle(event.target.data("communityId") as string));
    cy.on("tap", "node.entity", (event) => propsRef.current.onFocus({ kind: "entity", id: event.target.data("entityId") as string }));
    cy.on("tap", "edge.agg", (event) => {
      cy.edges().removeClass("picked");
      event.target.addClass("picked");
      setPicked({ a: event.target.source().data("title") as string, b: event.target.target().data("title") as string, count: event.target.data("count") as number });
    });
    cy.on("tap", (event) => {
      if (event.target !== cy) return;
      cy.edges().removeClass("picked");
      setPicked(null);
      propsRef.current.onFocus(null);
    });
    cy.on("mouseover", "node", (event) => {
      const node = event.target;
      const p = node.renderedPosition();
      const tt = tRef.current;
      const detail = node.data("kind") === "community"
        ? `${node.data("level") !== undefined ? tt("Level {level}, ", { level: node.data("level") as number }) : ""}${tt(node.hasClass("container") ? "{count} entities. Double-click to close." : "{count} entities. Double-click to open.", { count: fmt(node.data("count") as number) })}`
        : String(node.data("type"));
      setHover({ x: p.x, y: p.y - node.renderedHeight() / 2 - 8, title: node.data("title") as string, detail });
    });
    cy.on("mouseout", "node", () => setHover(null));
    cy.on("mouseover", "edge", (event) => event.target.addClass("hover"));
    cy.on("mouseout", "edge", (event) => event.target.removeClass("hover"));
    cy.on("pan zoom drag", () => setHover(null));
    cy.on("dragfree", "node", (event) => {
      const node = event.target as cytoscape.NodeSingular;
      if (!node.isParent()) positionsRef.current[node.id()] = { ...node.position() };
    });
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(host.current);
    // Clouds wrap everything drawn inside an open container, nested containers included.
    const containers = current.filter((el) => el.group === "nodes" && String(el.classes ?? "").includes("container"));
    const groups = containers.map((container, i) => {
      const inside = new Set<string>();
      let frontier = [container.data.id as string];
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const el of current) {
          if (el.group === "nodes" && el.data.parent && frontier.includes(el.data.parent as string) && !inside.has(el.data.id as string)) {
            inside.add(el.data.id as string);
            next.push(el.data.id as string);
          }
        }
        frontier = next;
      }
      return { id: container.data.id as string, label: String(container.data.label), ...cloudColors(i), elementIds: [...inside].filter((id) => !String(current.find((el) => el.data.id === id)?.classes ?? "").includes("container")) };
    });
    const detachClouds = wrapRef.current ? attachClouds(cy, wrapRef.current, () => (backgroundsRef.current === "clouds" ? groups : [])) : () => undefined;
    cyRef.current = cy;
    if (import.meta.env.DEV) (window as unknown as { __cy?: cytoscape.Core }).__cy = cy;
    return () => {
      detachClouds();
      observer.disconnect();
      cy.destroy();
      cyRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes(":parent").toggleClass("cloud", backgrounds === "clouds");
    cy.forceRender();
  }, [backgrounds, ready]);

  // Selection and entity focus are class changes only.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("selected focus neighbor in out");
      if (selectedId) {
        const node = cy.getElementById(communityKey(selectedId));
        node.addClass("selected");
        // A selection made elsewhere (tree, inspector, graph) is brought into view; a tap on the map is not.
        if (!node.empty() && !selectFromCanvas.current) cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.7) }, { duration: 300 });
      }
      selectFromCanvas.current = false;
      if (focus?.kind === "entity") {
        const node = cy.getElementById(entityKey(focus.id));
        if (node.empty()) return;
        node.addClass("focus");
        node.connectedEdges().connectedNodes().not(node).addClass("neighbor");
        node.outgoers("edge.ee").addClass("out");
        node.incomers("edge.ee").addClass("in");
        node.connectedEdges("edge.agg").addClass("hover");
      }
    });
  }, [selectedId, focus, ready]);

  const levels = partition.levels;
  const { stats } = model;
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of model.entities) counts.set(e.entity.type, (counts.get(e.entity.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [model]);

  return (
    <section className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-controls">
          <label className="control">{t("Show")}
            <select value={baseLevel === null ? "hierarchy" : String(baseLevel)} onChange={(e) => setBaseLevel(e.target.value === "hierarchy" ? null : Number(e.target.value))}>
              <option value="hierarchy">{nested ? t("hierarchy, open to descend") : t("all communities with parent links")}</option>
              {levels.map((level) => <option key={level} value={level}>{t("level {level} side by side", { level })}</option>)}
            </select>
          </label>
          <label className="control"><input type="checkbox" checked={showUnassigned} onChange={(e) => setShowUnassigned(e.target.checked)} /> {t("Entities in no community")}</label>
          <label className="control">{t("Communities")}
            <select value={backgrounds} onChange={(e) => onBackgroundsChange(e.target.value as "boxes" | "clouds")}>
              <option value="boxes">{t("boxes")}</option>
              <option value="clouds">{t("clouds")}</option>
            </select>
          </label>
          <label className="control">{t("Entity budget")}
            <select value={maxEntities} onChange={(e) => setMaxEntities(Number(e.target.value))}>
              {ENTITY_BUDGETS.map((n) => <option key={n} value={n}>{fmt(n)}</option>)}
            </select>
          </label>
        </div>
        <div className="graph-controls">
          <button className="btn" onClick={() => onExpandedChange(new Set())} disabled={expanded.size === 0}>{t("Close all")}</button>
          <button className="btn" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 } }, { duration: 250 })}>{t("Fit")}</button>
          <button className="btn" onClick={() => { positionsRef.current = {}; setNonce((n) => n + 1); }} title={t("Recompute the layout from scratch")}>{t("Re-layout")}</button>
          <button className="btn" onClick={() => cyRef.current && exportCytoscapePng(cyRef.current, "community-map")} title={t("Download the map as a PNG at 2x")}>PNG</button>
        </div>
      </div>

      {hiddenSelection && (
        <p className="map-note">
          {baseLevel === null
            ? t("{title} sits inside a closed community, so it is not drawn yet.", { title: hiddenSelection.title })
            : t("{title} is on level {level}, not on the level shown.", { title: hiddenSelection.title, level: hiddenSelection.level })}{" "}
          <button className="chip" onClick={revealSelection}>{baseLevel === null ? t("Open it here") : t("Show level {level}", { level: hiddenSelection.level })}</button>
        </p>
      )}
      {typeCounts.length > 0 && (
        <div className="graph-legend">
          <span className="legend-title">{t("Entity types")}</span>
          {typeCounts.map(([type, count]) => (
            <span key={type} className="legend-item"><i style={{ background: colors.get(type) }} />{type} <span className="num">{fmt(count)}</span></span>
          ))}
        </div>
      )}

      <div className="graph-canvas-wrap" ref={wrapRef}>
        <div className="graph-canvas" ref={host} role="img" aria-label="Community map" />
        {layout.status === "running" && <div className="layout-overlay">{t("Computing layout…")}</div>}
        {hover && (
          <div className="graph-tip" style={{ left: hover.x, top: hover.y }}>
            <strong>{hover.title}</strong>
            <span>{hover.detail}</span>
          </div>
        )}
        {picked && (
          <div className="picked-info">
            <Rich text="**{a}** and **{b}**: {count} relationships between their entities" vars={{ a: picked.a, b: picked.b, count: fmt(picked.count) }} />
          </div>
        )}
      </div>

      <p className="graph-stats">
        {t("{communities} communities and {entities} entities drawn", { communities: fmt(stats.communityNodes), entities: fmt(stats.entityNodes) })}
        {stats.truncatedEntities > 0 && t(" ({truncated} more held back by the entity budget)", { truncated: fmt(stats.truncatedEntities) })}
        {t(", {links} links between groups.", { links: fmt(model.aggregateEdges.length) })}
        {model.unassigned && t(" {total} entities belong to no community.", { total: fmt(model.unassigned.total) })}{" "}
        {baseLevel === null && nested && t("Double-click a community to open it: its child communities and its own members appear inside.")}
        {baseLevel === null && !nested && t("Parents do not contain their children in this data, so communities stand side by side; dashed arrows point to the parent. Double-click a community to see its members.")}
        {baseLevel !== null && t("One level side by side. Double-click a community to see its members.")}
        {t(" Line width is the number of relationships between two groups; click one for the count.")}
        {layout.status === "ready" && layout.where !== "cache" && t(" Layout {ms} ms{where}.", { ms: Math.round(layout.ms), where: layout.where === "worker" ? t(" off the main thread") : "" })}
        {layout.status === "ready" && layout.where === "cache" && t(" Layout restored from cache.")}
      </p>
    </section>
  );
}
