import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { typeColors } from "../../core/graph/palette";
import { communitySubgraph } from "../../core/graph/subgraph";
import type { Dataset, Partition } from "../../core/model";
import { fmt } from "../format";
import { buildElements, edgeId, fitToCommunities, layoutOptions, nodeId, runSeededLayout } from "./elements";
import { GRAPH_STYLE } from "./style";

cytoscape.use(fcose);

export type GraphFocus = { kind: "entity"; id: string } | { kind: "relationship"; id: string } | null;

interface Props {
  dataset: Dataset;
  partition: Partition;
  communityIds: string[];
  focus: GraphFocus;
  onFocus: (focus: GraphFocus) => void;
  onRemoveCommunity: (id: string) => void;
}

const NODE_LIMITS = [200, 500, 1000, 0];
const GHOST_LIMIT = 40;
const LABEL_AUTO_LIMIT = 150;

export function CommunityGraph({ dataset, partition, communityIds, focus, onFocus, onRemoveCommunity }: Props) {
  const [maxNodes, setMaxNodes] = useState(500);
  const [showBoundary, setShowBoundary] = useState(true);
  const [labels, setLabels] = useState<"all" | "focus">("all");
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [highlightType, setHighlightType] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number; title: string; type: string; community?: string } | null>(null);

  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const focusFromCanvas = useRef(false);
  const laidOut = useRef<typeof subgraph | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  const subgraph = useMemo(() => {
    const allTypes = communitySubgraph(dataset, partition, communityIds, { maxNodes: maxNodes || Infinity, includeBoundary: showBoundary, maxBoundaryNodes: GHOST_LIMIT }).typeCounts;
    const visible = new Set([...allTypes.keys()].filter((t) => !hiddenTypes.has(t)));
    return communitySubgraph(dataset, partition, communityIds, {
      maxNodes: maxNodes || Infinity,
      includeBoundary: showBoundary,
      maxBoundaryNodes: GHOST_LIMIT,
      relationshipTypes: hiddenTypes.size > 0 ? visible : undefined,
    });
  }, [dataset, partition, communityIds, maxNodes, showBoundary, hiddenTypes]);

  const colors = useMemo(() => typeColors(subgraph.nodes.map((n) => n.entity.type)), [subgraph]);

  // Big communities start with labels on selection only; the control above the canvas overrides it.
  useEffect(() => {
    setLabels(subgraph.stats.shownMembers > LABEL_AUTO_LIMIT ? "focus" : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityIds]);

  // Hub-and-spoke datasets: one relationship type can own most links; name it so it can be hidden in one click.
  const dominant = useMemo(() => {
    const internal = subgraph.edges.filter((e) => !e.boundary);
    if (internal.length < 20) return null;
    const counts = new Map<string, number>();
    for (const e of internal) counts.set(e.relationship.type, (counts.get(e.relationship.type) ?? 0) + 1);
    const [type, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return count / internal.length >= 0.5 && !hiddenTypes.has(type) ? { type, share: count / internal.length } : null;
  }, [subgraph, hiddenTypes]);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of subgraph.nodes) if (!node.ghost) counts.set(node.entity.type, (counts.get(node.entity.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [subgraph]);

  // A different edge set deserves a fresh layout, and a stale selection would hide the result.
  useEffect(() => {
    positions.current.clear();
    onFocusRef.current(null);
  }, [hiddenTypes, maxNodes]);

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
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    const known = subgraph.nodes.filter((n) => positions.current.has(n.entity.id)).length;
    const incremental = subgraph.nodes.length > 0 && known / subgraph.nodes.length >= 0.7;
    const elapsed = runSeededLayout(cy, layoutOptions(subgraph.nodes.length, incremental), subgraph.nodes.map((n) => n.entity.id).join("|"));
    fitToCommunities(cy);
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
      onFocusRef.current({ kind: "entity", id: event.target.data("entityId") });
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
    cyRef.current = cy;
    // Test hook: end-to-end checks drive the canvas through it (dev builds only).
    if (import.meta.env.DEV) (window as unknown as { __cy?: cytoscape.Core }).__cy = cy;
    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = undefined;
    };
  }, [subgraph, partition, communityIds, colors]);

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
      if (focus.kind === "entity") {
        const node = cy.getElementById(nodeId(focus.id));
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
          {included.map((c, i) => (
            <span key={c.id} className="chip static">
              {c.title} ({fmt(c.entityIds.length)})
              {i > 0 && <button className="chip-x" aria-label={`Remove ${c.title} from the graph`} onClick={() => onRemoveCommunity(c.id)}>×</button>}
            </span>
          ))}
        </div>
        <div className="graph-controls">
          <input className="field" placeholder="Find an entity" aria-label="Find an entity" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button className="btn" onClick={find} disabled={!query.trim()}>Find</button>
          <label className="control">Labels
            <select value={labels} onChange={(e) => setLabels(e.target.value as "all" | "focus")}>
              <option value="all">all</option>
              <option value="focus">selection only</option>
            </select>
          </label>
          <label className="control">Entities
            <select value={maxNodes} onChange={(e) => setMaxNodes(Number(e.target.value))}>
              {NODE_LIMITS.map((n) => <option key={n} value={n}>{n === 0 ? "all" : `top ${n}`}</option>)}
            </select>
          </label>
          <label className="control"><input type="checkbox" checked={showBoundary} onChange={(e) => setShowBoundary(e.target.checked)} /> Outside links</label>
          <button className="btn" onClick={() => cyRef.current && fitToCommunities(cyRef.current, true)} title="Frame the community">Fit</button>
          <button className="btn" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 } }, { duration: 250 })} title="Frame everything, outside links included">All</button>
          <button className="btn" onClick={relayout} title="Recompute the layout from scratch">Re-layout</button>
        </div>
      </div>

      <div className="graph-legend">
        <span className="legend-title">Entity types</span>
        {typeCounts.map(([type, count]) => (
          <button
            key={type}
            className={`legend-item${highlightType === type ? " active" : ""}`}
            onClick={() => setHighlightType(highlightType === type ? null : type)}
            title={highlightType === type ? "Show all types" : `Highlight ${type}`}
          >
            <i style={{ background: colors.get(type) }} />
            {type} <span className="num">{fmt(count)}</span>
          </button>
        ))}
        <span className="legend-title">Relationship types</span>
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
            title={hiddenTypes.has(type) ? `Show ${type}` : `Hide ${type}`}
          >
            {type} <span className="num">{fmt(count)}</span>
          </button>
        ))}
      </div>

      <div className="graph-canvas-wrap">
        <div className="graph-canvas" ref={host} role="img" aria-label="Community graph" />
        {hover && (
          <div className="graph-tip" style={{ left: hover.x, top: hover.y }}>
            <strong>{hover.title}</strong>
            <span>{hover.type}{hover.community ? ` · in ${hover.community}` : ""}</span>
          </div>
        )}
      </div>

      <p className="graph-stats">
        {fmt(stats.shownMembers)} of {fmt(stats.members)} entities, {fmt(stats.internalEdges)} internal relationships
        {showBoundary && <>, {fmt(stats.boundaryEdges)} outside links to {fmt(stats.ghostNodes)} entities drawn dashed</>}
        {stats.hiddenBoundaryEdges > 0 && <> ({fmt(stats.hiddenBoundaryEdges)} more outside links not drawn)</>}.
        {stats.shownMembers < stats.members && <> Showing the most connected {fmt(stats.shownMembers)}; raise the limit above to see all.</>}
        {dominant && <> <b>{dominant.type}</b> makes up {Math.round(dominant.share * 100)}% of the internal links; hide it in the relationship types above to see the rest of the structure.</>}
        {" "}Click a node for its neighbours, a link for its detail, the background or Esc to clear. Drag nodes to tidy; positions are kept while you filter.
      </p>
    </section>
  );
}
