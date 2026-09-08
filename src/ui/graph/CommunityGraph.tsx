import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { typeColors } from "../../core/graph/palette";
import { nestingRatio } from "../../core/graph/map";
import { communitiesOf, neighborhoodSubgraph } from "../../core/graph/neighborhood";
import { pathTo } from "../../core/hierarchy";
import { displayTitle } from "../../core/graph/palette";
import { bundleLeaves, communitySubgraph } from "../../core/graph/subgraph";
import type { Dataset, Partition } from "../../core/model";
import { exportCytoscapePng, safeName } from "../download";
import { fmt } from "../format";
import { useT } from "../i18n";
import { attachClouds, cloudColors } from "./clouds";
import { buildElements, edgeId, fitToCommunities, layoutOptions, nodeId, parentId, runSeededLayout } from "./elements";
import { GRAPH_STYLE } from "./style";

cytoscape.use(fcose);

export type GraphFocus = { kind: "entity"; id: string } | { kind: "relationship"; id: string } | { kind: "bundle"; id: string; label: string; hubId: string; relationshipType: string; entityIds: string[] } | null;

/** What the graph is centred on: one or more communities, or everything within a few hops of an entity. */
export type GraphMode = { kind: "communities" } | { kind: "neighborhood"; entityId: string; hops: number };

interface Props {
  dataset: Dataset;
  partition: Partition;
  communityIds: string[];
  focus: GraphFocus;
  onFocus: (focus: GraphFocus) => void;
  onRemoveCommunity: (id: string) => void;
  mode: GraphMode;
  onHopsChange: (hops: number) => void;
  onLeaveNeighborhood: () => void;
  /** Opens the map with the parents of these communities expanded, the paper's upper plane. */
  onShowOnMap: (communityIds: string[]) => void;
}

const NODE_LIMITS = [200, 500, 1000, 0];
const GHOST_LIMIT = 40;
const LABEL_AUTO_LIMIT = 150;
const BUNDLE_AUTO_LIMIT = 80;
const FAINT_EDGE_LIMIT = 300;
/** A relationship type owning at least this share of a big community's links is hidden until asked for. */
const DOMINANT_SHARE = 0.5;
const DOMINANT_MIN_EDGES = 150;

export function CommunityGraph({ dataset, partition, communityIds: selectedIds, focus, onFocus, onRemoveCommunity, mode, onHopsChange, onLeaveNeighborhood, onShowOnMap }: Props) {
  const { t } = useT();
  const [maxNodes, setMaxNodes] = useState(500);
  const [showBoundary, setShowBoundary] = useState(true);
  const [labels, setLabels] = useState<"all" | "focus">("all");
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [fold, setFold] = useState(true);
  const [backgrounds, setBackgrounds] = useState<"clouds" | "boxes">("clouds");
  const [autoHidden, setAutoHidden] = useState<{ type: string; share: number } | null>(null);
  const [highlightType, setHighlightType] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number; title: string; type: string; community?: string } | null>(null);

  const host = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);
  const backgroundsRef = useRef(backgrounds);
  backgroundsRef.current = backgrounds;
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const focusFromCanvas = useRef(false);
  const laidOut = useRef<typeof subgraph | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  const neighborhood = mode.kind === "neighborhood" ? mode : null;
  const rawSubgraph = useMemo(() => {
    const limit = maxNodes || Infinity;
    if (neighborhood) {
      const allTypes = neighborhoodSubgraph(dataset, partition, neighborhood.entityId, { hops: neighborhood.hops, maxNodes: limit }).typeCounts;
      const visible = new Set([...allTypes.keys()].filter((t) => !hiddenTypes.has(t)));
      return neighborhoodSubgraph(dataset, partition, neighborhood.entityId, { hops: neighborhood.hops, maxNodes: limit, relationshipTypes: hiddenTypes.size > 0 ? visible : undefined });
    }
    const allTypes = communitySubgraph(dataset, partition, selectedIds, { maxNodes: limit, includeBoundary: showBoundary, maxBoundaryNodes: GHOST_LIMIT }).typeCounts;
    const visible = new Set([...allTypes.keys()].filter((t) => !hiddenTypes.has(t)));
    return communitySubgraph(dataset, partition, selectedIds, {
      maxNodes: limit,
      includeBoundary: showBoundary,
      maxBoundaryNodes: GHOST_LIMIT,
      relationshipTypes: hiddenTypes.size > 0 ? visible : undefined,
    });
  }, [dataset, partition, selectedIds, neighborhood, maxNodes, showBoundary, hiddenTypes]);
  // Leaves hanging off one hub fold into one node each; the seed of a neighbourhood is never folded.
  const subgraph = useMemo(
    () => (fold ? bundleLeaves(rawSubgraph, { minGroup: 3, keep: neighborhood?.entityId }) : rawSubgraph),
    [rawSubgraph, fold, neighborhood],
  );
  const bundleCount = subgraph.nodes.filter((n) => n.bundle).length;
  const folded = rawSubgraph.nodes.length - subgraph.nodes.length + bundleCount;
  // Containers: the selected communities, or, around an entity, the primary communities of what was reached.
  const communityIds = useMemo(() => (neighborhood ? communitiesOf(subgraph.nodes) : selectedIds), [neighborhood, subgraph, selectedIds]);
  const seed = neighborhood ? dataset.entities.get(neighborhood.entityId) : undefined;

  const colors = useMemo(() => typeColors(rawSubgraph.nodes.map((n) => n.entity.type)), [rawSubgraph]);

  // Big communities start with labels on selection only; the control above the canvas overrides it.
  useEffect(() => {
    setLabels(rawSubgraph.stats.shownMembers > LABEL_AUTO_LIMIT ? "focus" : "all");
    setFold(rawSubgraph.stats.shownMembers > BUNDLE_AUTO_LIMIT);
    // A hub-and-spoke type (belongsToProject on 66% of the links) buries everything else; start without it.
    if (neighborhood) {
      setAutoHidden(null);
      setHiddenTypes(new Set());
      return;
    }
    const plain = communitySubgraph(dataset, partition, selectedIds, { maxNodes: maxNodes || Infinity, includeBoundary: false, maxBoundaryNodes: 0 });
    const counts = new Map<string, number>();
    for (const e of plain.edges) counts.set(e.relationship.type, (counts.get(e.relationship.type) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && plain.edges.length >= DOMINANT_MIN_EDGES && top[1] / plain.edges.length >= DOMINANT_SHARE) {
      setAutoHidden({ type: top[0], share: top[1] / plain.edges.length });
      setHiddenTypes(new Set([top[0]]));
    } else {
      setAutoHidden(null);
      setHiddenTypes(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, neighborhood?.entityId]);

  // Hub-and-spoke datasets: one relationship type can own most links; name it so it can be hidden in one click.
  const dominant = useMemo(() => {
    const internal = subgraph.edges.filter((e) => !e.boundary);
    if (internal.length < 20) return null;
    const counts = new Map<string, number>();
    for (const e of internal) counts.set(e.relationship.type, (counts.get(e.relationship.type) ?? 0) + 1);
    const [type, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return count / internal.length >= 0.5 && !hiddenTypes.has(type) && type !== autoHidden?.type ? { type, share: count / internal.length } : null;
  }, [subgraph, hiddenTypes, autoHidden]);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of rawSubgraph.nodes) if (!node.ghost) counts.set(node.entity.type, (counts.get(node.entity.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rawSubgraph]);

  // A different edge set deserves a fresh layout, and a stale selection would hide the result.
  // Compared against the previous values rather than "first run", so a mount (or StrictMode's
  // double mount) never clears an entity the caller focused on purpose.
  const filterKey = `${[...hiddenTypes].sort().join(",")}|${maxNodes}`;
  const previousFilter = useRef(filterKey);
  useEffect(() => {
    if (previousFilter.current === filterKey) return;
    previousFilter.current = filterKey;
    positions.current.clear();
    onFocusRef.current(null);
  }, [filterKey]);

  // Build (or rebuild) the graph whenever the subgraph changes; keep positions of nodes that survive.
  useEffect(() => {
    if (!host.current) return;
    const elements = buildElements({ subgraph, partition, communityIds, colors, positions: positions.current });
    const cy = cytoscape({
      container: host.current,
      elements,
      style: GRAPH_STYLE,
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 6,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    const known = subgraph.nodes.filter((n) => positions.current.has(n.entity.id)).length;
    const incremental = subgraph.nodes.length > 0 && known / subgraph.nodes.length >= 0.7;
    const elapsed = runSeededLayout(cy, layoutOptions(subgraph.nodes.length, incremental), subgraph.nodes.map((n) => n.entity.id).join("|"));
    fitToCommunities(cy);
    if (subgraph.edges.length > FAINT_EDGE_LIMIT) cy.edges().addClass("faint");
    if (neighborhood) cy.getElementById(nodeId(neighborhood.entityId)).addClass("seed");
    if (import.meta.env.DEV) console.info(`[graph] ${subgraph.nodes.length} nodes, ${subgraph.edges.length} edges, layout ${Math.round(elapsed)} ms${incremental ? " (incremental)" : ""}`);

    const remember = () => {
      cy.nodes().not(":parent").forEach((n) => {
        positions.current.set(n.data("entityId"), { ...n.position() });
      });
    };
    remember();
    cy.on("dragfree", "node", remember);
    cy.on("tap", "node", (event) => {
      if (event.target.isParent()) return;
      focusFromCanvas.current = true;
      const id = event.target.data("entityId") as string;
      const node = subgraph.nodes.find((n) => n.entity.id === id);
      if (node?.bundle) {
        onFocusRef.current({ kind: "bundle", id, label: node.entity.title, hubId: node.bundle.hubId, relationshipType: node.bundle.relationshipType, entityIds: node.bundle.entityIds });
        return;
      }
      onFocusRef.current({ kind: "entity", id });
    });
    cy.on("tap", "edge", (event) => {
      focusFromCanvas.current = true;
      onFocusRef.current({ kind: "relationship", id: event.target.data("relationshipId") });
    });
    cy.on("tap", (event) => {
      if (event.target === cy) onFocusRef.current(null);
    });
    cy.on("mouseover", "node", (event) => {
      const node = event.target;
      if (node.isParent()) return;
      const p = node.renderedPosition();
      const owner = subgraph.nodes.find((n) => n.entity.id === node.data("entityId"))?.community;
      setHover({ x: p.x, y: p.y - node.renderedHeight() / 2 - 8, title: node.data("title"), type: node.data("type"), community: owner?.title });
    });
    cy.on("mouseout", "node", () => setHover(null));
    cy.on("mouseover", "edge", (event) => event.target.addClass("hover"));
    cy.on("mouseout", "edge", (event) => event.target.removeClass("hover"));
    cy.on("pan zoom drag", () => setHover(null));

    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(host.current);
    // Clouds: one per container, wrapping the rendered positions of its member nodes; when the hierarchy
    // is a real containment, each ancestor gets a larger dashed cloud around everything below it.
    const leafGroups = communityIds.map((id, i) => {
      const community = partition.communities.get(id);
      const key = parentId(id);
      return {
        id,
        label: community ? `${community.title} (${community.entityIds.length})` : id,
        ...cloudColors(i),
        elementIds: elements.filter((el) => el.group === "nodes" && el.data.parent === key).map((el) => el.data.id as string),
      };
    });
    const ancestors = new Map<string, Set<string>>();
    if (nestingRatio(partition) >= 0.9) {
      for (const group of leafGroups) {
        for (const ancestor of pathTo(partition, group.id).slice(0, -1)) {
          if (communityIds.includes(ancestor.id)) continue;
          const set = ancestors.get(ancestor.id) ?? new Set<string>();
          group.elementIds.forEach((id) => set.add(id));
          ancestors.set(ancestor.id, set);
        }
      }
    }
    const outerGroups = [...ancestors.entries()]
      .map(([id, ids], i) => {
        const community = partition.communities.get(id);
        return { id, label: community ? `${community.title} (${community.entityIds.length})` : id, ...cloudColors(i + 7, true), elementIds: [...ids], outer: true };
      })
      .sort((a, b) => (partition.communities.get(a.id)?.size ?? 0) - (partition.communities.get(b.id)?.size ?? 0))
      .reverse();
    const groups = [...outerGroups, ...leafGroups];
    const detachClouds = wrapRef.current ? attachClouds(cy, wrapRef.current, () => (backgroundsRef.current === "clouds" && groups.length >= 2 ? groups : [])) : () => undefined;
    cyRef.current = cy;
    // Test hook: end-to-end checks drive the canvas through it (dev builds only).
    if (import.meta.env.DEV) (window as unknown as { __cy?: cytoscape.Core }).__cy = cy;
    return () => {
      detachClouds();
      observer.disconnect();
      cy.destroy();
      cyRef.current = undefined;
    };
  }, [subgraph, partition, communityIds, colors]);

  // Boxes or clouds: the compound nodes stay for layout; only their paint toggles.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // One container is a frame, not a grouping: keep the box there and use clouds from two communities up.
    cy.nodes(":parent").toggleClass("cloud", backgrounds === "clouds" && communityIds.length >= 2);
    cy.forceRender();
  }, [backgrounds, subgraph, communityIds]);

  // Selection, label mode and type highlight are pure class changes; no relayout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Right after a rebuild the camera already frames the community; recentering on a stale selection would drag it away.
    const rebuilt = laidOut.current !== subgraph;
    laidOut.current = subgraph;
    cy.batch(() => {
      cy.elements().removeClass("faded focus neighbor in out picked quiet dim");
      const plain = cy.nodes().not(":parent");
      if (labels === "focus") plain.addClass("quiet");
      if (highlightType) plain.filter((n) => n.data("type") !== highlightType).addClass("dim");
      if (!focus) return;
      if (focus.kind === "entity" || focus.kind === "bundle") {
        let node = cy.getElementById(nodeId(focus.id));
        // A folded leaf is represented by its bundle.
        if (node.empty() && focus.kind === "entity") {
          const holder = subgraph.nodes.find((n) => n.bundle?.entityIds.includes(focus.id));
          if (holder) node = cy.getElementById(nodeId(holder.entity.id));
        }
        if (node.empty()) return;
        const edges = node.connectedEdges();
        const hood = node.union(edges).union(edges.connectedNodes());
        cy.elements().not(hood).not(hood.parents()).addClass("faded");
        hood.parents().addClass("faded");
        node.addClass("focus");
        edges.connectedNodes().not(node).addClass("neighbor");
        node.outgoers("edge").addClass("out");
        node.incomers("edge").addClass("in");
        // Hubs with hundreds of neighbours would drown in labels; keep the focus label and let hover do the rest.
        const neighbours = edges.connectedNodes().not(node);
        node.removeClass("quiet dim");
        if (neighbours.length <= 40) neighbours.removeClass("quiet dim");
        else neighbours.removeClass("dim");
        if (!focusFromCanvas.current && !rebuilt) cy.animate({ center: { eles: node } }, { duration: 250 });
      } else {
        const edge = cy.getElementById(edgeId(focus.id));
        if (edge.empty()) return;
        const ends = edge.connectedNodes();
        cy.elements().not(edge).not(ends).not(ends.parents()).addClass("faded");
        ends.parents().addClass("faded");
        edge.addClass("picked");
        ends.removeClass("quiet dim");
        if (!focusFromCanvas.current && !rebuilt) cy.animate({ center: { eles: edge } }, { duration: 250 });
      }
    });
    focusFromCanvas.current = false;
  }, [focus, labels, highlightType, subgraph]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onFocusRef.current(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const find = () => {
    const cy = cyRef.current;
    const needle = query.trim().toLowerCase();
    if (!cy || !needle) return;
    const hit = cy.nodes().not(":parent").filter((n) => String(n.data("title")).toLowerCase().includes(needle) || String(n.data("label")).toLowerCase().includes(needle)).first();
    if (hit.empty()) return;
    onFocus({ kind: "entity", id: hit.data("entityId") });
    cy.animate({ center: { eles: hit }, zoom: Math.max(cy.zoom(), 1.4) }, { duration: 250 });
  };

  const relayout = () => {
    const cy = cyRef.current;
    if (!cy) return;
    positions.current.clear();
    runSeededLayout(cy, layoutOptions(subgraph.nodes.length, false), subgraph.nodes.map((n) => n.entity.id).join("|"));
    fitToCommunities(cy);
    cy.nodes().not(":parent").forEach((n) => {
      positions.current.set(n.data("entityId"), { ...n.position() });
    });
  };

  const included = communityIds.map((id) => partition.communities.get(id)).filter((c) => c !== undefined);
  const { stats } = subgraph;

  return (
    <section className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-communities">
          {neighborhood && seed ? (
            <>
              <span className="chip static">{t("Around {entity}", { entity: displayTitle(seed) })}</span>
              <label className="control">{t("Hops")}
                <select value={neighborhood.hops} onChange={(e) => onHopsChange(Number(e.target.value))}>
                  {[1, 2, 3].map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <button className="btn" onClick={onLeaveNeighborhood}>{t("Back to the community")}</button>
              <button className="btn" onClick={() => onShowOnMap(communityIds)} title={t("The communities of this graph as nodes inside their parents")}>{t("See on map")}</button>
            </>
          ) : (
            <>
              {included.map((c, i) => (
                <span key={c.id} className="chip static">
                  {c.title} ({fmt(c.entityIds.length)})
                  {i > 0 && <button className="chip-x" aria-label={t("Remove {title} from the graph", { title: c.title })} onClick={() => onRemoveCommunity(c.id)}>×</button>}
                </span>
              ))}
              <button className="btn" onClick={() => onShowOnMap(communityIds)} title={t("The communities of this graph as nodes inside their parents")}>{t("See on map")}</button>
            </>
          )}
        </div>
        <div className="graph-controls">
          <input className="field" placeholder={t("Find an entity")} aria-label={t("Find an entity")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button className="btn" onClick={find} disabled={!query.trim()}>{t("Find")}</button>
          <label className="control">{t("Labels")}
            <select value={labels} onChange={(e) => setLabels(e.target.value as "all" | "focus")}>
              <option value="all">{t("all")}</option>
              <option value="focus">{t("selection only")}</option>
            </select>
          </label>
          <label className="control">{t("Entities")}
            <select value={maxNodes} onChange={(e) => setMaxNodes(Number(e.target.value))}>
              {NODE_LIMITS.map((n) => <option key={n} value={n}>{n === 0 ? t("all") : t("top {n}", { n })}</option>)}
            </select>
          </label>
          {!neighborhood && <label className="control"><input type="checkbox" checked={showBoundary} onChange={(e) => setShowBoundary(e.target.checked)} /> {t("Outside links")}</label>}
          <label className="control">{t("Communities")}
            <select value={backgrounds} onChange={(e) => setBackgrounds(e.target.value as "clouds" | "boxes")}>
              <option value="clouds">{t("clouds")}</option>
              <option value="boxes">{t("boxes")}</option>
            </select>
          </label>
          <label className="control" title={t("Leaves of one type on the same hub become one node")}><input type="checkbox" checked={fold} onChange={(e) => setFold(e.target.checked)} /> {t("Fold leaves")}</label>
          <button className="btn" onClick={() => cyRef.current && fitToCommunities(cyRef.current, true)} title={t("Frame the community")}>{t("Fit")}</button>
          <button className="btn" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 } }, { duration: 250 })} title={t("Frame everything, outside links included")}>{t("All")}</button>
          <button className="btn" onClick={relayout} title={t("Recompute the layout from scratch")}>{t("Re-layout")}</button>
          <button className="btn" onClick={() => cyRef.current && exportCytoscapePng(cyRef.current, neighborhood && seed ? `around-${safeName(displayTitle(seed))}` : `community-${safeName(included[0]?.title ?? "graph")}`)} title={t("Download the picture as a PNG at 2x")}>PNG</button>
        </div>
      </div>

      <div className="graph-legend">
        <span className="legend-title">{t("Entity types")}</span>
        {typeCounts.map(([type, count]) => (
          <button
            key={type}
            className={`legend-item${highlightType === type ? " active" : ""}`}
            onClick={() => setHighlightType(highlightType === type ? null : type)}
            title={highlightType === type ? t("Show all types") : t("Highlight {type}", { type })}
          >
            <i style={{ background: colors.get(type) }} />
            {type} <span className="num">{fmt(count)}</span>
          </button>
        ))}
        <span className="legend-title">{t("Relationship types")}</span>
        {[...subgraph.typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => (
          <button
            key={type}
            className={`legend-item rel${hiddenTypes.has(type) ? " off" : ""}`}
            onClick={() => setHiddenTypes((prev) => {
              const next = new Set(prev);
              if (next.has(type)) next.delete(type);
              else next.add(type);
              return next;
            })}
            title={hiddenTypes.has(type) ? t("Show {type}", { type }) : t("Hide {type}", { type })}
          >
            {type} <span className="num">{fmt(count)}</span>
          </button>
        ))}
      </div>

      <div className="graph-canvas-wrap" ref={wrapRef}>
        <div className="graph-canvas" ref={host} role="img" aria-label="Community graph" />
        {hover && (
          <div className="graph-tip" style={{ left: hover.x, top: hover.y }}>
            <strong>{hover.title}</strong>
            <span>{hover.type}{hover.community ? ` · in ${hover.community}` : ""}</span>
          </div>
        )}
      </div>

      <p className="graph-stats">
        {neighborhood
          ? t("{shown} of {members} entities within {hops} hops, {internal} relationships, in {communities} communities", { shown: fmt(stats.shownMembers), members: fmt(stats.members), hops: neighborhood.hops, internal: fmt(stats.internalEdges), communities: fmt(communityIds.length) })
          : t("{shown} of {members} entities, {internal} internal relationships", { shown: fmt(stats.shownMembers), members: fmt(stats.members), internal: fmt(stats.internalEdges) })}
        {!neighborhood && showBoundary && t(", {boundary} outside links to {ghosts} entities drawn dashed", { boundary: fmt(stats.boundaryEdges), ghosts: fmt(stats.ghostNodes) })}
        {stats.hiddenBoundaryEdges > 0 && t(" ({hidden} more outside links not drawn)", { hidden: fmt(stats.hiddenBoundaryEdges) })}.
        {stats.shownMembers < stats.members && ` ${t("Showing the most connected {shown}; raise the limit above to see all.", { shown: fmt(stats.shownMembers) })}`}
        {bundleCount > 0 && ` ${t("{leaves} leaves folded into {bundles} bundles; click a bundle for its members.", { leaves: fmt(folded), bundles: fmt(bundleCount) })}`}
        {autoHidden && hiddenTypes.has(autoHidden.type) && <> <b>{autoHidden.type}</b>{t(" ({share}% of the links) is hidden by default; click its chip above to show it.", { share: Math.round(autoHidden.share * 100) })}</>}
        {dominant && <> <b>{dominant.type}</b>{t(" makes up {share}% of the internal links; hide it in the relationship types above to see the rest of the structure.", { share: Math.round(dominant.share * 100) })}</>}
        {" "}{t("Click a node for its neighbours, a link for its detail, the background or Esc to clear. Drag nodes to tidy; positions are kept while you filter.")}
      </p>
    </section>
  );
}
