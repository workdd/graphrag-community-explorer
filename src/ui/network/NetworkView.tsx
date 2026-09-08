import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { membershipIndex, primaryCommunity } from "../../core/hierarchy";
import { displayTitle, typeColors } from "../../core/graph/palette";
import { hashText } from "../../core/graph/seed";
import { forwardShare, layerOrder, typeFlow } from "../../core/graph/layers";
import type { Dataset, Entity, Partition, Relationship } from "../../core/model";
import { exportCytoscapePng } from "../download";
import { fmt } from "../format";
import { attachClouds, cloudColors, type CloudGroup } from "../graph/clouds";
import type { GraphFocus } from "../graph/CommunityGraph";
import { loadCachedLayout, requestLayout, saveCachedLayout } from "../graph/layoutClient";
import { useT } from "../i18n";

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  focus: GraphFocus;
  onFocus: (focus: GraphFocus) => void;
  selectedCommunityId: string | null;
  onSelectCommunity: (id: string) => void;
  onExplore: (entityId: string) => void;
}

/** How communities are laid over the plain graph. `off` is the knowledge graph on its own. */
type Overlay = "off" | "clouds" | "colour";
/** Free force layout, or one column per entity type with the relationships flowing forward. */
type Arrange = "force" | "layers";
type Order = "degree" | "name";
type Positions = Record<string, { x: number; y: number }>;

const BUDGETS = [300, 800, 2000, 5000, 20000];
const LABEL_LIMIT = 150;
const FAINT_EDGES = 400;
const BAND = { width: 240, boxWidth: 190, boxHeight: 22, gap: 8, top: 46 };
const ROW_CHOICES = [12, 16, 20, 25, 30, 40, 50, 65, 80, 100, 130, 170, 220];

/**
 * A type with hundreds of members would make a column taller than any screen, so a column wraps
 * into sub-columns. The row count is the one that brings the whole picture closest to a 16:9 shape.
 */
export function bandRows(counts: number[]): number {
  const target = 16 / 9;
  let best = ROW_CHOICES[0];
  let bestOff = Infinity;
  for (const rows of ROW_CHOICES) {
    const columns = counts.reduce((sum, count) => sum + Math.max(1, Math.ceil(count / rows)), 0);
    const width = columns * BAND.width;
    const height = BAND.top + Math.min(rows, Math.max(...counts, 1)) * (BAND.boxHeight + BAND.gap);
    const ratio = width / Math.max(height, 1);
    const off = Math.abs(Math.log(ratio / target));
    if (off < bestOff) {
      bestOff = off;
      best = rows;
    }
  }
  return best;
}

/** The whole knowledge graph: entities and relationships, with communities as something you add. */
export function NetworkView({ dataset, partition, focus, onFocus, selectedCommunityId, onSelectCommunity, onExplore }: Props) {
  const { t } = useT();
  const [overlay, setOverlay] = useState<Overlay>("off");
  // Typed graphs read best as columns, and that arrangement is instant; a graph with one or two
  // types has no columns worth drawing, so it opens in the force layout instead.
  const [arrange, setArrange] = useState<Arrange>(() => (new Set([...dataset.entities.values()].map((e) => e.type)).size >= 3 ? "layers" : "force"));
  const [order, setOrder] = useState<Order>("degree");
  const [budget, setBudget] = useState(() => Math.min(BUDGETS.find((b) => b >= dataset.entities.size) ?? 800, 800));
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenRelationships, setHiddenRelationships] = useState<Set<string>>(new Set());
  const [isolated, setIsolated] = useState(false);
  const [query, setQuery] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);
  const cloudsRef = useRef<CloudGroup[]>([]);
  const [layoutMs, setLayoutMs] = useState<number | null>(null);
  const [ready, setReady] = useState<{ signature: string; positions: Positions } | null>(null);

  const colors = useMemo(() => typeColors([...dataset.entities.values()].map((e) => e.type)), [dataset]);
  const primary = useMemo(() => {
    if (!partition) return new Map<string, string>();
    const index = membershipIndex(partition);
    const out = new Map<string, string>();
    for (const id of index.keys()) {
      const community = primaryCommunity(index, id);
      if (community) out.set(id, community.id);
    }
    return out;
  }, [partition]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entity of dataset.entities.values()) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [dataset]);
  const relationshipCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const relationship of dataset.relationships) counts.set(relationship.type, (counts.get(relationship.type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [dataset]);

  // Filters first, then the budget keeps the busiest entities, so a large index still draws.
  const view = useMemo(() => {
    const kept = new Map<string, Entity>();
    for (const entity of dataset.entities.values()) if (!hiddenTypes.has(entity.type)) kept.set(entity.id, entity);
    const edges: Relationship[] = [];
    const degree = new Map<string, number>();
    for (const relationship of dataset.relationships) {
      if (hiddenRelationships.has(relationship.type)) continue;
      if (!kept.has(relationship.sourceId) || !kept.has(relationship.targetId)) continue;
      edges.push(relationship);
      degree.set(relationship.sourceId, (degree.get(relationship.sourceId) ?? 0) + 1);
      degree.set(relationship.targetId, (degree.get(relationship.targetId) ?? 0) + 1);
    }
    let nodes = [...kept.values()];
    if (!isolated) nodes = nodes.filter((entity) => (degree.get(entity.id) ?? 0) > 0);
    const total = nodes.length;
    if (nodes.length > budget) {
      nodes = nodes.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, budget);
    }
    const drawn = new Set(nodes.map((n) => n.id));
    return { nodes, edges: edges.filter((e) => drawn.has(e.sourceId) && drawn.has(e.targetId)), total, degree };
  }, [dataset, hiddenTypes, hiddenRelationships, budget, isolated]);

  const elements = useMemo((): cytoscape.ElementDefinition[] => {
    const nodes = view.nodes.map((entity) => ({
      group: "nodes" as const,
      data: {
        id: entity.id,
        label: displayTitle(entity),
        type: entity.type,
        size: 10 + Math.min(26, Math.sqrt(view.degree.get(entity.id) ?? 0) * 5),
        color: colors.get(entity.type) ?? "#8c96a0",
        paint: colors.get(entity.type) ?? "#8c96a0",
      },
    }));
    const edges = view.edges.map((relationship) => ({
      group: "edges" as const,
      data: { id: relationship.id, source: relationship.sourceId, target: relationship.targetId, label: relationship.type },
    }));
    return [...nodes, ...edges];
  }, [view, colors]);

  // Type-to-type edge counts drive the column order, and the share that flows forward is reported.
  const layers = useMemo(() => {
    const flow = typeFlow(
      view.edges.flatMap((relationship) => {
        const from = dataset.entities.get(relationship.sourceId)?.type;
        const to = dataset.entities.get(relationship.targetId)?.type;
        return from === undefined || to === undefined ? [] : [{ from, to }];
      }),
    );
    const types = [...new Set(view.nodes.map((entity) => entity.type))];
    const ordered = layerOrder(types, flow);
    return { order: ordered, ...forwardShare(ordered, flow) };
  }, [view, dataset]);

  const bandNodes = useMemo((): cytoscape.ElementDefinition[] => {
    if (arrange !== "layers") return [];
    const counts = new Map<string, number>();
    for (const entity of view.nodes) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    return layers.order.map((type, i) => ({
      group: "nodes" as const,
      classes: "band",
      data: { id: `band:${type}`, label: `L${i}  ${type}  ${fmt(counts.get(type) ?? 0)}`, color: "#ffffff", paint: "#ffffff", size: 1 },
    }));
  }, [arrange, layers, view]);

  const bandPositions = useMemo((): Positions => {
    if (arrange !== "layers") return {};
    const columns = new Map<string, Entity[]>();
    for (const entity of view.nodes) {
      const list = columns.get(entity.type);
      if (list) list.push(entity);
      else columns.set(entity.type, [entity]);
    }
    const rows = bandRows(layers.order.map((type) => columns.get(type)?.length ?? 0));
    const positions: Positions = {};
    let x = 0;
    for (const type of layers.order) {
      const members = (columns.get(type) ?? []).sort((a, b) =>
        order === "name" ? a.title.localeCompare(b.title) : (view.degree.get(b.id) ?? 0) - (view.degree.get(a.id) ?? 0) || a.title.localeCompare(b.title),
      );
      members.forEach((entity, i) => {
        positions[entity.id] = { x: x + Math.floor(i / rows) * BAND.width, y: BAND.top + (i % rows) * (BAND.boxHeight + BAND.gap) };
      });
      positions[`band:${type}`] = { x, y: 0 };
      x += Math.max(1, Math.ceil(members.length / rows)) * BAND.width;
    }
    return positions;
  }, [arrange, view, layers, order]);

  const signature = useMemo(() => `${arrange}:${order}:${elements.map((e) => e.data.id).join(",")}`, [elements, arrange, order]);
  const cacheKey = useMemo(() => `network:${dataset.source.files.join(",")}:${hashText(signature)}`, [dataset, signature]);

  useEffect(() => {
    let cancelled = false;
    if (arrange === "layers") {
      setReady({ signature, positions: bandPositions });
      setLayoutMs(0);
      return;
    }
    void (async () => {
      const cached = await loadCachedLayout(cacheKey);
      if (cancelled) return;
      if (cached && elements.every((e) => e.group === "edges" || cached[e.data.id as string])) {
        setReady({ signature, positions: cached });
        setLayoutMs(0);
        return;
      }
      setReady(null);
      const result = await requestLayout("map", elements, false, cacheKey);
      if (cancelled) return;
      void saveCachedLayout(cacheKey, result.positions);
      setReady({ signature, positions: result.positions });
      setLayoutMs(result.ms);
    })();
    return () => {
      cancelled = true;
    };
  }, [elements, signature, cacheKey, arrange, bandPositions]);

  const propsRef = useRef({ onFocus, onSelectCommunity });
  propsRef.current = { onFocus, onSelectCommunity };

  useEffect(() => {
    if (!host.current || !wrap.current || !ready || ready.signature !== signature) return;
    const layered = arrange === "layers";
    const all = layered ? [...elements.map((el) => (el.group === "nodes" ? { ...el, classes: "box" } : el)), ...bandNodes] : elements;
    const placed = all.map((el) => (el.group === "nodes" && ready.positions[el.data.id as string] ? { ...el, position: ready.positions[el.data.id as string] } : el));
    const cy = cytoscape({
      container: host.current,
      elements: placed,
      style: [
        { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(paint)", "border-width": 1, "border-color": "#ffffff", label: "data(label)", "font-size": 10, color: "#1b2430", "text-valign": "bottom", "text-margin-y": 2, "text-background-color": "#f3f4f1", "text-background-opacity": 0.75, "text-background-padding": "1px", "min-zoomed-font-size": 9, "z-index": 10 } },
        // Layer mode: one labelled box per entity, stacked in the column of its type.
        { selector: "node.box", style: { shape: "round-rectangle", width: BAND.boxWidth, height: BAND.boxHeight, "background-color": "data(paint)", "background-opacity": 0.16, "border-width": 1.5, "border-color": "data(paint)", label: "data(label)", "text-valign": "center", "text-halign": "center", "text-margin-y": 0, "font-size": 11, "text-max-width": `${BAND.boxWidth - 16}px`, "text-overflow-wrap": "anywhere", "text-background-opacity": 0 } },
        { selector: "node.band", style: { shape: "rectangle", width: BAND.boxWidth, height: 1, "background-opacity": 0, "border-width": 0, "z-index": 5, label: "data(label)", "text-valign": "top", "text-margin-y": -6, "font-size": 12, "font-weight": 700, color: "#3a3a36", "text-background-opacity": 0, events: "no" } },
        { selector: "node.nolabel", style: { label: "" } },
        { selector: "edge", style: { width: 1, "line-color": "#c2c9d1", "curve-style": "haystack", "haystack-radius": 0, "z-index": 1 } },
        { selector: "edge.flow", style: { "curve-style": "bezier", "control-point-step-size": 60, "target-arrow-shape": "triangle", "target-arrow-color": "#b6bec7", "arrow-scale": 0.7 } },
        { selector: "edge.back", style: { "line-color": "#b4453a", "target-arrow-color": "#b4453a", "line-style": "dashed", opacity: 0.7 } },
        { selector: "edge.same", style: { "line-style": "dashed", opacity: 0.45 } },
        { selector: "edge.faint", style: { opacity: 0.35 } },
        { selector: "node.dim", style: { opacity: 0.15 } },
        { selector: "edge.dim", style: { opacity: 0.06 } },
        { selector: "node.focus", style: { "border-width": 3, "border-color": "#5a6fbe", label: "data(label)", "font-size": 12, "z-index": 30 } },
        { selector: "node.neighbor", style: { "border-width": 2, "border-color": "#7b8794", label: "data(label)", "z-index": 20 } },
        { selector: "edge.on", style: { width: 2, "line-color": "#8b9dd4", "target-arrow-color": "#8b9dd4", opacity: 1, label: "data(label)", "font-size": 10, color: "#5a6fbe", "text-background-color": "#ffffff", "text-background-opacity": 0.85, "z-index": 3 } },
        // A hub with hundreds of links would drown the picture in repeated labels.
        { selector: "edge.on.many", style: { label: "", width: 1.2, opacity: 0.5 } },
        { selector: "edge.picked", style: { width: 2.5, "line-color": "#c08a4e", "target-arrow-color": "#c08a4e", opacity: 1, "z-index": 4 } },
      ],
      layout: { name: "preset" },
      minZoom: 0.02,
      maxZoom: 6,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    if (layered) {
      const rank = new Map(layers.order.map((type, i) => [type, i]));
      cy.batch(() => {
        cy.edges().forEach((edge) => {
          const from = rank.get(edge.source().data("type") as string);
          const to = rank.get(edge.target().data("type") as string);
          edge.addClass("flow");
          if (from === undefined || to === undefined) return;
          if (from === to) edge.addClass("same");
          else if (to < from) edge.addClass("back");
        });
      });
    }
    if (layered) {
      // Fitting hundreds of stacked boxes makes every label unreadable, so layers open at full size
      // in the top-left corner and the reader pans; Fit is one button away.
      cy.zoom(1);
      cy.pan({ x: 60, y: 20 });
    } else {
      cy.fit(cy.elements(), 40);
    }
    if (!layered && cy.nodes().length > LABEL_LIMIT) cy.nodes().addClass("nolabel");
    if (cy.edges().length > FAINT_EDGES) cy.edges().addClass("faint");
    cy.on("tap", "node", (event) => propsRef.current.onFocus({ kind: "entity", id: event.target.id() }));
    cy.on("tap", "edge", (event) => propsRef.current.onFocus({ kind: "relationship", id: event.target.id() }));
    cy.on("tap", (event) => {
      if (event.target === cy) propsRef.current.onFocus(null);
    });
    cyRef.current = cy;
    const detach = attachClouds(cy, wrap.current, () => cloudsRef.current);
    if (import.meta.env.DEV) (window as unknown as { __cyNetwork?: cytoscape.Core }).__cyNetwork = cy;
    return () => {
      detach();
      cy.destroy();
      cyRef.current = undefined;
    };
  }, [ready, signature, elements, arrange, bandNodes, layers]);

  // Communities are an overlay on top of the plain graph, never a change to what is drawn.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const groups = new Map<string, string[]>();
    if (overlay !== "off" && partition) {
      for (const node of cy.nodes(".band").absoluteComplement()) {
        const community = primary.get(node.id());
        if (!community) continue;
        const list = groups.get(community);
        if (list) list.push(node.id());
        else groups.set(community, [node.id()]);
      }
    }
    const groupOrder = [...groups.keys()].sort();
    cy.batch(() => {
      cy.nodes(".band").absoluteComplement().forEach((node) => {
        const community = primary.get(node.id());
        const index = community === undefined ? -1 : groupOrder.indexOf(community);
        node.data("paint", overlay === "colour" && index >= 0 ? cloudColors(index).stroke : (node.data("color") as string));
      });
    });
    cloudsRef.current = overlay === "clouds"
      ? [...groups.entries()]
          .filter(([, ids]) => ids.length >= 2)
          .map(([community, ids]) => ({
            id: community,
            label: partition?.communities.get(community)?.title ?? community,
            ...cloudColors(groupOrder.indexOf(community)),
            elementIds: ids,
          }))
      : [];
    cy.forceRender();
  }, [overlay, partition, primary, ready, arrange, selectedCommunityId]);

  // Focus dims everything that is not the selected entity and its neighbours.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("dim focus neighbor on picked");
      if (focus?.kind === "entity") {
        const node = cy.getElementById(focus.id);
        if (node.empty()) return;
        const near = node.closedNeighborhood();
        cy.elements().not(near).addClass("dim");
        node.addClass("focus");
        near.nodes().not(node).addClass("neighbor");
        const links = node.connectedEdges();
        links.addClass("on");
        if (links.length > 30) links.addClass("many");
        cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 250 });
      } else if (focus?.kind === "relationship") {
        const edge = cy.getElementById(focus.id);
        if (edge.empty()) return;
        cy.elements().not(edge.connectedNodes().union(edge)).addClass("dim");
        edge.addClass("picked");
      }
    });
  }, [focus, ready]);

  const find = () => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return;
    const hit = view.nodes.find((entity) => entity.title.toLowerCase().includes(needle));
    if (hit) onFocus({ kind: "entity", id: hit.id });
  };

  const focused = focus?.kind === "entity" ? dataset.entities.get(focus.id) : undefined;
  const focusedCommunity = focused && partition ? primary.get(focused.id) : undefined;

  return (
    <section className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-controls">
          <label className="control">{t("Communities")}
            <select value={overlay} onChange={(e) => setOverlay(e.target.value as Overlay)} disabled={!partition} title={partition ? undefined : t("Needs communities.parquet")}>
              <option value="off">{t("off")}</option>
              <option value="clouds">{t("clouds")}</option>
              <option value="colour">{t("node colour")}</option>
            </select>
          </label>
          <label className="control">{t("Arrange")}
            <select value={arrange} onChange={(e) => setArrange(e.target.value as Arrange)}>
              <option value="force">{t("free")}</option>
              <option value="layers">{t("layers by entity type")}</option>
            </select>
          </label>
          {arrange === "layers" && (
            <label className="control">{t("Order")}
              <select value={order} onChange={(e) => setOrder(e.target.value as Order)}>
                <option value="degree">{t("most connected first")}</option>
                <option value="name">{t("by name")}</option>
              </select>
            </label>
          )}
          <label className="control">{t("Entities")}
            <select value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
              {BUDGETS.map((value) => <option key={value} value={value}>{t("top {n}", { n: fmt(value) })}</option>)}
            </select>
          </label>
          <label className="control"><input type="checkbox" checked={isolated} onChange={(e) => setIsolated(e.target.checked)} /> {t("Entities with no relationships")}</label>
        </div>
        <div className="graph-controls">
          <input className="field find" placeholder={t("Find an entity")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button className="btn" onClick={find}>{t("Find")}</button>
          <button className="btn" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 } }, { duration: 250 })}>{t("Fit")}</button>
          <button className="btn" onClick={() => cyRef.current && exportCytoscapePng(cyRef.current, "knowledge-graph")}>PNG</button>
        </div>
      </div>

      <div className="graph-legend">
        <span className="legend-title">{t("Entity types")}</span>
        {typeCounts.map(([type, count]) => (
          <button
            key={type}
            className={`legend-item${hiddenTypes.has(type) ? " off" : ""}`}
            onClick={() => setHiddenTypes((prev) => { const next = new Set(prev); if (next.has(type)) next.delete(type); else next.add(type); return next; })}
            title={t("Show or hide this entity type")}
          >
            <i style={{ background: colors.get(type) }} />{type} <span className="num">{fmt(count)}</span>
          </button>
        ))}
      </div>
      <div className="graph-legend">
        <span className="legend-title">{t("Relationship types")}</span>
        {relationshipCounts.map(([type, count]) => (
          <button
            key={type}
            className={`legend-item${hiddenRelationships.has(type) ? " off" : ""}`}
            onClick={() => setHiddenRelationships((prev) => { const next = new Set(prev); if (next.has(type)) next.delete(type); else next.add(type); return next; })}
            title={t("Show or hide this relationship type")}
          >
            {type} <span className="num">{fmt(count)}</span>
          </button>
        ))}
      </div>

      <div className="graph-canvas-wrap" ref={wrap}>
        <div className="graph-canvas" ref={host} />
        {!ready && <div className="view-loading">{t("Laying out {n} entities…", { n: fmt(view.nodes.length) })}</div>}
      </div>

      <p className="graph-stats">
        {t("{shown} of {total} entities and {edges} relationships drawn.", { shown: fmt(view.nodes.length), total: fmt(view.total), edges: fmt(view.edges.length) })}{" "}
        {view.total > view.nodes.length && t("The busiest are kept; raise the entity budget to see more.")}{" "}
        {arrange === "layers" && layers.total > 0 && t("Columns are ordered so {share} of relationships point forward; the ones that do not are dashed red.", { share: `${Math.round((layers.forward / layers.total) * 100)}%` })}{" "}
        {arrange === "force" && layoutMs !== null && layoutMs > 0 && t("Layout {ms} ms off the main thread.", { ms: Math.round(layoutMs) })}{" "}
        {t("Click a node for its neighbours, a link for its detail, the background to clear.")}
        {focused && focusedCommunity && (
          <>
            {" "}
            <button className="chip" onClick={() => onSelectCommunity(focusedCommunity)}>{t("Community of {title}", { title: displayTitle(focused) })}</button>{" "}
            <button className="chip" onClick={() => onExplore(focused.id)}>{t("Explore neighbourhood")}</button>
          </>
        )}
      </p>
    </section>
  );
}
