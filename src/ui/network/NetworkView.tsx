import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { membershipIndex, primaryCommunity } from "../../core/hierarchy";
import { displayTitle, typeColors } from "../../core/graph/palette";
import { hashText } from "../../core/graph/seed";
import { forwardShare, layerGroups, layerOrder, typeFlow } from "../../core/graph/layers";
import { exitsFrom, extendSelection, schemaGraph, selectType, type SchemaSelection, type SchemaTripleEdge } from "../../core/graph/schemaGraph";
import { egoBranches, egoSummary, type EgoModel } from "../../core/graph/ego";
import type { Dataset, Entity, Partition, Relationship } from "../../core/model";
import { exportCytoscapePng } from "../download";
import { fmt } from "../format";
import { attachClouds, cloudColors, type CloudGroup } from "../graph/clouds";
import { attachLabeller } from "../graph/labeller";
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
  /** Types picked in the schema view; the graph narrows to them until it is cleared. */
  spotlight: SchemaSelection | null;
  onClearSpotlight: () => void;
  onSpotlight: (selection: SchemaSelection) => void;
  /** The record the graph is centred on, picked here or from the finder in the top bar. */
  seed: string | null;
  onSeed: (entityId: string | null) => void;
}

/** How communities are laid over the plain graph. `off` is the knowledge graph on its own. */
type Overlay = "off" | "clouds" | "colour";
/** Free force layout, or one column per entity type with the relationships flowing forward. */
/** The schema is the frame: types are nodes until one is opened into its records. */
type Arrange = "schema" | "focus" | "force" | "layers";
const FOCUS_RADIUS = 250;

/** The type belongs on every node: a name alone does not say what kind of thing it is. */
const nodeLabel = (entity: Entity) => `${displayTitle(entity)}\n${entity.type}`;
/** A community name is long; the label only has room for the head of it. */
const shortName = (text: string) => {
  const head = text.split(" · ")[0];
  return head.length > 18 ? `${head.slice(0, 17)}…` : head;
};
/** One line for the layer boxes, which have a fixed height and would clip a wrapped label. */
const boxLabel = (entity: Entity) => {
  const text = `${entity.type} · ${displayTitle(entity)}`;
  return text.length > 26 ? `${text.slice(0, 25)}…` : text;
};
type Order = "degree" | "name";
type Positions = Record<string, { x: number; y: number }>;

/** How many records a sample draws when the whole graph is asked for at once. */
const SAMPLE = 800;
/** Records named when a type or a group is opened. Everything past this is one bubble with a count. */
const REPRESENTATIVES = 2;
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
export function NetworkView({ dataset, partition, focus, onFocus, selectedCommunityId, onSelectCommunity, onExplore, spotlight, onClearSpotlight, onSpotlight, seed, onSeed }: Props) {
  const { t } = useT();
  const [overlay, setOverlay] = useState<Overlay>("off");
  // Typed graphs read best as columns, and that arrangement is instant; a graph with one or two
  // types has no columns worth drawing, so it opens in the force layout instead.
  const [arrange, setArrange] = useState<Arrange>("schema");
  // Types opened into their records; everything else stays a single node of the schema.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  // Types the reader asked to see in full, one bubble click at a time.
  const [fullTypes, setFullTypes] = useState<Set<string>>(new Set());
  // One record at the centre, its neighbours grouped: a few named and the rest kept as a count.
  const seedId = seed;
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Part or whole, and it means the same thing in every arrangement: a readable sample, or all of it.
  const [mode, setMode] = useState<"some" | "all">("some");
  const [order, setOrder] = useState<Order>("degree");
  const showAll = mode === "all";
  const cap = showAll ? Math.max(dataset.entities.size, 1) : SAMPLE;
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

  // A schema selection replaces the filters, so what is drawn is exactly the slice that was picked.
  useEffect(() => {
    if (!spotlight) return;
    const types = new Set(spotlight.types);
    const relationships = new Set(spotlight.relationships);
    setHiddenTypes(new Set([...new Set([...dataset.entities.values()].map((e) => e.type))].filter((type) => !types.has(type))));
    setHiddenRelationships(new Set([...new Set(dataset.relationships.map((r) => r.type))].filter((type) => !relationships.has(type))));
    setIsolated(false);
  }, [spotlight, dataset]);

  const colors = useMemo(() => typeColors([...dataset.entities.values()].map((e) => e.type)), [dataset]);
  const schema = useMemo(() => schemaGraph(dataset), [dataset]);
  const primaryRef = useRef(new Map<string, string>());
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

  primaryRef.current = primary;

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
    // Whole means whole, so records with no relationships come along with it.
    if (!isolated && !showAll) nodes = nodes.filter((entity) => (degree.get(entity.id) ?? 0) > 0);
    const total = nodes.length;
    if (nodes.length > cap) {
      nodes = nodes.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, cap);
    }
    const drawn = new Set(nodes.map((n) => n.id));
    return { nodes, edges: edges.filter((e) => drawn.has(e.sourceId) && drawn.has(e.targetId)), total, degree };
  }, [dataset, hiddenTypes, hiddenRelationships, cap, isolated, showAll]);

  const ego: EgoModel | null = useMemo(
    () => (arrange === "focus" && seedId ? egoSummary(dataset, seedId, { perGroup: showAll ? cap : REPRESENTATIVES, perOpenGroup: cap, opened: openGroups }) : null),
    [arrange, seedId, dataset, showAll, openGroups, cap],
  );

  // Two hops, always: one hop says what a record touches, two say what it sits in.
  const branches = useMemo(() => (ego ? egoBranches(dataset, ego) : []), [ego, dataset]);

  const focusElements = useMemo((): cytoscape.ElementDefinition[] => {
    if (!ego) return [];
    const nodeFor = (entity: Entity, extra: Record<string, unknown> = {}) => ({
      group: "nodes" as const,
      classes: "record",
      data: {
        id: entity.id, type: entity.type, name: displayTitle(entity), label: nodeLabel(entity), boxLabel: boxLabel(entity), fontSize: 10,
        size: 12 + Math.min(22, Math.sqrt(entity.degree) * 4),
        color: colors.get(entity.type) ?? "#8c96a0", paint: colors.get(entity.type) ?? "#8c96a0",
        ...extra,
      },
    });
    const nodes: cytoscape.ElementDefinition[] = [{ ...nodeFor(ego.seed), classes: "record seed", data: { ...nodeFor(ego.seed).data, size: 46, fontSize: 13 } }];
    const edges: cytoscape.ElementDefinition[] = [];
    const placed = new Set([ego.seed.id]);
    for (const group of ego.groups) {
      for (const entity of group.shown) {
        if (!placed.has(entity.id)) {
          nodes.push(nodeFor(entity));
          placed.add(entity.id);
        }
        const [source, target] = group.direction === "out" ? [ego.seed.id, entity.id] : [entity.id, ego.seed.id];
        edges.push({ group: "edges" as const, classes: "flow", data: { id: `${group.key}:${entity.id}`, source, target, label: group.relationship } });
      }
      if (group.hidden > 0) {
        const id = `sum:${group.key}`;
        const colour = colors.get(group.neighbourType) ?? "#8c96a0";
        nodes.push({
          group: "nodes" as const,
          classes: "summary",
          data: { id, label: `+${fmt(group.hidden)}\n${group.neighbourType}`, fontSize: 11, size: 34 + Math.min(26, Math.log1p(group.hidden) * 7), color: colour, paint: colour, groupKey: group.key },
        });
        const [source, target] = group.direction === "out" ? [ego.seed.id, id] : [id, ego.seed.id];
        edges.push({ group: "edges" as const, classes: "flow agg", data: { id: `edge:${id}`, source, target, label: `${group.relationship} ${fmt(group.total)}`, width: 2 } });
      }
    }
    for (const branch of branches) {
      for (const entity of branch.shown) {
        if (!placed.has(entity.id)) {
          nodes.push({ ...nodeFor(entity), classes: "record ring2" });
          placed.add(entity.id);
        }
        edges.push({ group: "edges" as const, classes: "flow second", data: { id: `b:${branch.entity.id}:${entity.id}`, source: branch.entity.id, target: entity.id, label: "" } });
      }
      if (branch.hidden > 0) {
        const id = `sum:${branch.entity.id}`;
        nodes.push({
          group: "nodes" as const,
          classes: "summary ring2",
          data: { id, label: branch.hiddenType ? `+${fmt(branch.hidden)}\n${branch.hiddenType}` : `+${fmt(branch.hidden)}`, fontSize: 11, size: 26, color: colors.get(branch.hiddenType) ?? "#8c96a0", paint: colors.get(branch.hiddenType) ?? "#8c96a0" },
        });
        edges.push({ group: "edges" as const, classes: "flow agg second", data: { id: `edge:${id}`, source: branch.entity.id, target: id, label: "", width: 1.2 } });
      }
    }
    return [...nodes, ...edges];
  }, [ego, branches, colors]);

  // A star reads best drawn as one: the seed in the middle, each group its own slice of the circle.
  const focusPositions = useMemo((): Positions => {
    if (!ego) return {};
    const slots = ego.groups.map((group) => group.shown.length + (group.hidden > 0 ? 1 : 0));
    const total = slots.reduce((sum, count) => sum + count, 0) || 1;
    const radius = Math.max(FOCUS_RADIUS, total * 13);
    const positions: Positions = { [ego.seed.id]: { x: 0, y: 0 } };
    let angle = -Math.PI / 2;
    ego.groups.forEach((group, index) => {
      const span = (slots[index] / total) * Math.PI * 2;
      group.shown.forEach((entity, i) => {
        const a = angle + span * ((i + 0.5) / slots[index]);
        if (!positions[entity.id]) positions[entity.id] = { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
      });
      if (group.hidden > 0) {
        const a = angle + span * ((group.shown.length + 0.5) / slots[index]);
        positions[`sum:${group.key}`] = { x: Math.cos(a) * radius * 1.3, y: Math.sin(a) * radius * 1.3 };
      }
      angle += span;
    });
    // The second ring sits just outside the neighbour it hangs from, so the branch reads as one arm.
    for (const branch of branches) {
      const parent = positions[branch.entity.id];
      if (!parent) continue;
      // Branches of neighbours that sit close together would land on top of each other, so each
      // arm is nudged around the circle by its own index as well as by its parent's direction.
      const base = Math.atan2(parent.y, parent.x) + (branches.indexOf(branch) - (branches.length - 1) / 2) * 0.22;
      const children = [...branch.shown.map((entity) => entity.id), ...(branch.hidden > 0 ? [`sum:${branch.entity.id}`] : [])];
      children.forEach((id, i) => {
        if (positions[id]) return;
        const spread = (i - (children.length - 1) / 2) * 0.2;
        positions[id] = { x: Math.cos(base + spread) * radius * 1.62, y: Math.sin(base + spread) * radius * 1.62 };
      });
    }
    return positions;
  }, [ego, branches]);

  const schemaElements = useMemo((): cytoscape.ElementDefinition[] => {
    if (arrange !== "schema") return [];
    const drawnTypes = schema.nodes.filter((node) => !hiddenTypes.has(node.type));
    const open = new Set([...opened].filter((type) => !hiddenTypes.has(type)));
    // Records of the opened types only, and the busiest first when a type is large.
    const records = new Map<string, Entity[]>();
    const rest = new Map<string, number>();
    for (const type of open) {
      const all = [...dataset.entities.values()]
        .filter((entity) => entity.type === type)
        .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title));
      const limit = showAll || fullTypes.has(type) ? cap : REPRESENTATIVES;
      records.set(type, all.slice(0, limit));
      rest.set(type, Math.max(0, all.length - limit));
    }
    const drawnIds = new Set([...records.values()].flat().map((entity) => entity.id));
    const nodes: cytoscape.ElementDefinition[] = drawnTypes.map((node) => ({
      group: "nodes" as const,
      classes: open.has(node.type) ? "typebox" : "typenode",
      data: {
        id: `type:${node.type}`,
        kind: "community",
        type: node.type,
        label: open.has(node.type) ? `${node.type}  ${fmt(records.get(node.type)?.length ?? 0)}/${fmt(node.entities)}` : `${node.type}\n${fmt(node.entities)}`,
        fontSize: 13,
        size: 40 + Math.sqrt(node.entities) * 4,
        color: colors.get(node.type) ?? "#8c96a0",
        paint: colors.get(node.type) ?? "#8c96a0",
      },
    }));
    for (const [type, list] of records) {
      const hidden = rest.get(type) ?? 0;
      if (hidden > 0) {
        const colour = colors.get(type) ?? "#8c96a0";
        nodes.push({
          group: "nodes" as const,
          classes: "summary",
          data: { id: `sum:type:${type}`, parent: `type:${type}`, label: `+${fmt(hidden)}`, fontSize: 11, size: 30 + Math.min(24, Math.log1p(hidden) * 6), color: colour, paint: colour, fullType: type },
        });
      }
      for (const entity of list) {
        nodes.push({
          group: "nodes" as const,
          classes: "record",
          data: {
            id: entity.id, parent: `type:${type}`, type, name: displayTitle(entity), label: nodeLabel(entity), boxLabel: boxLabel(entity), fontSize: 9,
            size: 10 + Math.min(20, Math.sqrt(entity.degree) * 4),
            color: colors.get(type) ?? "#8c96a0", paint: colors.get(type) ?? "#8c96a0",
          },
        });
      }
    }
    // A relationship is drawn between whatever is on screen: two records, or the type nodes they sit in.
    const endpoint = (id: string): string | null => {
      if (drawnIds.has(id)) return id;
      const type = dataset.entities.get(id)?.type;
      if (type === undefined || hiddenTypes.has(type)) return null;
      return open.has(type) ? null : `type:${type}`;
    };
    const direct: cytoscape.ElementDefinition[] = [];
    const aggregate = new Map<string, { source: string; target: string; count: number; names: Set<string> }>();
    for (const relationship of dataset.relationships) {
      if (hiddenRelationships.has(relationship.type)) continue;
      const a = endpoint(relationship.sourceId);
      const b = endpoint(relationship.targetId);
      if (a === null || b === null || a === b) continue;
      if (drawnIds.has(a) && drawnIds.has(b)) {
        direct.push({ group: "edges" as const, data: { id: relationship.id, source: a, target: b, label: relationship.type } });
        continue;
      }
      const key = `agg:${a}|${b}`;
      const found = aggregate.get(key);
      if (found) {
        found.count += 1;
        found.names.add(relationship.type);
      } else aggregate.set(key, { source: a, target: b, count: 1, names: new Set([relationship.type]) });
    }
    const heaviest = Math.max(...[...aggregate.values()].map((edge) => edge.count), 1);
    const agg = [...aggregate.entries()].map(([id, edge]) => ({
      group: "edges" as const,
      classes: "agg",
      data: {
        id, source: edge.source, target: edge.target,
        kind: edge.source.startsWith("type:") && edge.target.startsWith("type:") ? "agg-loose" : "agg",
        label: `${[...edge.names].slice(0, 2).join(", ")} ${fmt(edge.count)}`,
        width: 1 + (Math.log1p(edge.count) / Math.log1p(heaviest)) * 5,
      },
    }));
    return [...nodes, ...direct, ...agg];
  }, [arrange, schema, opened, fullTypes, hiddenTypes, hiddenRelationships, cap, showAll, dataset, colors]);

  const entityElements = useMemo((): cytoscape.ElementDefinition[] => {
    if (arrange === "schema") return [];
    const nodes = view.nodes.map((entity) => ({
      group: "nodes" as const,
      data: {
        id: entity.id,
        label: nodeLabel(entity),
        boxLabel: boxLabel(entity),
        name: displayTitle(entity),
        type: entity.type,
        fontSize: 10,
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
  }, [arrange, view, colors]);

  const elements = arrange === "schema" ? schemaElements : arrange === "focus" ? focusElements : entityElements;

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
    // Types that nothing separates share a column heading, so a graph of twenty types does not
    // become twenty columns.
    return { order: ordered, groups: layerGroups(ordered, flow), ...forwardShare(ordered, flow) };
  }, [view, dataset]);

  const bandNodes = useMemo((): cytoscape.ElementDefinition[] => {
    if (arrange !== "layers") return [];
    const counts = new Map<string, number>();
    for (const entity of view.nodes) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    return layers.groups.map((group) => {
      const drawn = group.types.filter((type) => (counts.get(type) ?? 0) > 0);
      const total = drawn.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0);
      return {
        group: "nodes" as const,
        classes: "band",
        data: { id: `band:${group.layer}`, label: `L${group.layer}  ${drawn.join(" · ")}  ${fmt(total)}`, color: "#ffffff", paint: "#ffffff", size: 1 },
      };
    });
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
    for (const group of layers.groups) {
      positions[`band:${group.layer}`] = { x, y: 0 };
      for (const type of group.types) {
        const members = (columns.get(type) ?? []).sort((a, b) =>
          order === "name" ? a.title.localeCompare(b.title) : (view.degree.get(b.id) ?? 0) - (view.degree.get(a.id) ?? 0) || a.title.localeCompare(b.title),
        );
        members.forEach((entity, i) => {
          positions[entity.id] = { x: x + Math.floor(i / rows) * BAND.width, y: BAND.top + (i % rows) * (BAND.boxHeight + BAND.gap) };
        });
        x += Math.max(1, Math.ceil(members.length / rows)) * BAND.width;
      }
    }
    return positions;
  }, [arrange, view, layers, order]);

  const signature = useMemo(() => `${arrange}:${order}:${elements.map((e) => e.data.id).join(",")}`, [elements, arrange, order]);
  const cacheKey = useMemo(() => `network:${dataset.source.files.join(",")}:${hashText(signature)}`, [dataset, signature]);

  useEffect(() => {
    let cancelled = false;
    if (arrange === "layers" || arrange === "focus") {
      setReady({ signature, positions: arrange === "focus" ? focusPositions : bandPositions });
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
  }, [elements, signature, cacheKey, arrange, bandPositions, focusPositions]);

  const propsRef = useRef({ onFocus, onSelectCommunity, onSeed });
  propsRef.current = { onFocus, onSelectCommunity, onSeed };

  // A record chosen anywhere else opens centred here.
  useEffect(() => {
    if (seed) {
      setArrange("focus");
      setOpenGroups(new Set());
    }
  }, [seed]);

  useEffect(() => {
    if (!host.current || !wrap.current || !ready || ready.signature !== signature) return;
    const layered = arrange === "layers";
    const all = layered ? [...elements.map((el) => (el.group === "nodes" ? { ...el, classes: "box" } : el)), ...bandNodes] : elements;
    const placed = all.map((el) => (el.group === "nodes" && ready.positions[el.data.id as string] ? { ...el, position: ready.positions[el.data.id as string] } : el));
    const cy = cytoscape({
      container: host.current,
      elements: placed,
      style: [
        { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(paint)", "border-width": 1, "border-color": "#ffffff", label: "data(label)", "font-size": 10, color: "#1b2430", "text-valign": "bottom", "text-margin-y": 2, "text-background-color": "#f3f4f1", "text-background-opacity": 0.75, "text-background-padding": "1px", "text-wrap": "wrap", "min-zoomed-font-size": 9, "z-index": 10 } },
        // Layer mode: one labelled box per entity, stacked in the column of its type.
        { selector: "node.box", style: { shape: "round-rectangle", width: BAND.boxWidth, height: BAND.boxHeight, "background-color": "data(paint)", "background-opacity": 0.16, "border-width": 1.5, "border-color": "data(paint)", label: "data(boxLabel)", "text-wrap": "none", "text-valign": "center", "text-halign": "center", "text-margin-y": 0, "font-size": 11, "text-background-opacity": 0 } },
        // The schema backbone: a type is one node until it is opened, and then a box holding its records.
        { selector: "node.typenode", style: { shape: "ellipse", "background-opacity": 0.22, "border-width": 2, "border-color": "data(color)", label: "data(label)", "text-wrap": "wrap", "text-valign": "center", "font-size": 13, "line-height": 1.25, "text-background-opacity": 0, "z-index": 12 } },
        { selector: "node.typebox", style: { shape: "round-rectangle", "background-color": "data(color)", "background-opacity": 0.07, "border-width": 1.5, "border-color": "data(color)", "border-style": "dashed", label: "data(label)", "text-valign": "top", "text-halign": "center", "text-margin-y": -6, "font-size": 12, "font-weight": 600, "text-background-opacity": 0, padding: "14px", "z-index": 2 } },
        { selector: "node.seed", style: { "border-width": 3, "border-color": "#5a6fbe", "font-size": 13, "font-weight": 600, "text-margin-y": 8, "text-background-color": "#f3f4f1", "text-background-opacity": 0.85, "z-index": 30 } },
        // The rest of a group, kept as one bubble rather than a hundred dots.
        { selector: "node.summary", style: { shape: "round-rectangle", "background-opacity": 0.14, "border-width": 1.5, "border-color": "data(color)", "border-style": "dashed", label: "data(label)", "text-wrap": "wrap", "text-valign": "center", "font-size": 11, "text-background-opacity": 0, "z-index": 12 } },
        { selector: "node.ring2", style: { opacity: 0.92, "font-size": 9 } },
        { selector: "edge.second", style: { "line-color": "#aeb6bf", "target-arrow-color": "#aeb6bf", width: 1.2 } },
        { selector: "node.record", style: { "text-valign": "bottom", "font-size": 9, "z-index": 11 } },
        { selector: "edge.agg", style: { width: "data(width)", "curve-style": "bezier", "line-color": "#b6bec7", "target-arrow-shape": "triangle", "target-arrow-color": "#b6bec7", "arrow-scale": 0.8, label: "data(label)", "font-size": 9, color: "#5f6b78", "text-background-color": "#f3f4f1", "text-background-opacity": 0.85, "text-background-padding": "2px", "text-rotation": "autorotate", "min-zoomed-font-size": 8, "z-index": 2 } },
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
    if (cy.edges().length > FAINT_EDGES) cy.edges().addClass("faint");
    cy.on("tap", "node.typenode, node.typebox", (event) => {
      const type = event.target.data("type") as string;
      setOpened((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      });
      setFullTypes((prev) => {
        if (!prev.has(type)) return prev;
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    });
    cy.on("tap", "node.record", (event) => {
      const id = event.target.id();
      propsRef.current.onFocus({ kind: "entity", id });
      // Clicking a record moves the centre there: a few of its neighbours by name, the rest counted.
      propsRef.current.onSeed(id);
      setOpenGroups(new Set());
      setArrange("focus");
    });
    cy.on("tap", "node.summary", (event) => {
      const type = event.target.data("fullType") as string | undefined;
      if (type) {
        setFullTypes((prev) => new Set([...prev, type]));
        return;
      }
      const key = event.target.data("groupKey") as string;
      if (key) setOpenGroups((prev) => new Set([...prev, key]));
    });
    cy.on("tap", "node", (event) => {
      if (event.target.hasClass("typenode") || event.target.hasClass("typebox") || event.target.hasClass("record")) return;
      propsRef.current.onFocus({ kind: "entity", id: event.target.id() });
    });
    cy.on("tap", "edge", (event) => propsRef.current.onFocus({ kind: "relationship", id: event.target.id() }));
    cy.on("tap", (event) => {
      if (event.target === cy) propsRef.current.onFocus(null);
    });
    cyRef.current = cy;
    const detach = attachClouds(cy, wrap.current, () => cloudsRef.current);
    // Members of a community are named before loose records, and hubs before the rest, which is
    // what makes a crowded picture still say what it is about.
    const stopLabels = attachLabeller(cy, {
      priority: (node) => {
        if (node.hasClass("seed")) return 1e9;
        if (node.hasClass("typenode") || node.hasClass("typebox") || node.hasClass("summary")) return 1e8;
        const inCommunity = primaryRef.current.has(node.id()) ? 1e6 : 0;
        return inCommunity + node.degree(false);
      },
    });
    if (import.meta.env.DEV) (window as unknown as { __cyNetwork?: cytoscape.Core }).__cyNetwork = cy;
    return () => {
      stopLabels();
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
        const name = node.data("name") as string | undefined;
        const type = node.data("type") as string | undefined;
        if (name && type) {
          const title = community && partition ? partition.communities.get(community)?.title : undefined;
          node.data("label", overlay !== "off" && title ? `${name}\n${type} · ${shortName(title)}` : `${name}\n${type}`);
        }
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
      // The focus arrangement is already the neighbourhood of one record, so dimming it would only
      // hide the second ring it was drawn to show.
      if (arrange === "focus") return;
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
  }, [focus, ready, arrange]);

  const find = () => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return;
    const hit = view.nodes.find((entity) => entity.title.toLowerCase().includes(needle));
    if (hit) onFocus({ kind: "entity", id: hit.id });
  };

  const schemaCounts = useMemo(() => ({
    types: schemaElements.filter((el) => el.classes === "typenode" || el.classes === "typebox").length,
    records: schemaElements.filter((el) => el.classes === "record").length,
    edges: schemaElements.filter((el) => el.group === "edges").length,
  }), [schemaElements]);

  // Where the current slice can still be widened, biggest first.
  const exits = useMemo((): SchemaTripleEdge[] => (spotlight ? exitsFrom(schema, spotlight).slice(0, 6) : []), [schema, spotlight]);

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
              <option value="schema">{t("schema, open a type to see its records")}</option>
              {seedId && <option value="focus">{t("one record at the centre")}</option>}
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
          <label className="control">{t("Show")}
            <select value={mode} onChange={(event) => { setMode(event.target.value as "some" | "all"); setOpenGroups(new Set()); }}>
              <option value="some">{t("part of the data")}</option>
              <option value="all">{t("all of the data ({n} entities)", { n: fmt(dataset.entities.size) })}</option>
            </select>
          </label>
          <label className="control"><input type="checkbox" checked={isolated} onChange={(e) => setIsolated(e.target.checked)} /> {t("Entities with no relationships")}</label>
        </div>
        <div className="graph-controls">
          {arrange === "focus" && ego && (
            <>
              <button className="chip static" onClick={() => { onSeed(null); setArrange("schema"); }} title={t("Back to the schema")}>
                {t("centred on {title}", { title: displayTitle(ego.seed) })} <span className="chip-x">×</span>
              </button>
            </>
          )}
          {spotlight && (
            <button className="chip static" onClick={() => { setHiddenTypes(new Set()); setHiddenRelationships(new Set()); onClearSpotlight(); }} title={t("Show the whole graph again")}>
              {t("from the schema: {label}", { label: spotlight.label })} <span className="chip-x">×</span>
            </button>
          )}
          <input className="field find" placeholder={t("Find an entity")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button className="btn" onClick={find}>{t("Find")}</button>
          <button className="btn" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 } }, { duration: 250 })}>{t("Fit")}</button>
          <button className="btn" onClick={() => cyRef.current && exportCytoscapePng(cyRef.current, "knowledge-graph")}>PNG</button>
        </div>
      </div>

      <div className="schema-strip">
        <span className="legend-title">{t("Schema")}</span>
        {layers.groups.map((group) => (
          <span key={group.layer} className="strip-band">
            <span className="strip-layer">L{group.layer}</span>
            {group.types.map((type) => (
              <button
                key={type}
                className={`chip${spotlight?.types.includes(type) ? " on" : ""}`}
                onClick={() => onSpotlight(selectType(schema, type))}
                title={t("Draw this type and everything it touches")}
              >
                <i style={{ background: colors.get(type) }} />{type}
              </button>
            ))}
          </span>
        ))}
      </div>
      {spotlight && exits.length > 0 && (
        <div className="schema-strip">
          <span className="legend-title">{t("Follow")}</span>
          {exits.map((edge) => (
            <button key={edge.id} className="chip" onClick={() => onSpotlight(extendSelection(spotlight, edge))} title={t("Add this relationship and the type at its other end")}>
              + {edge.from} <span className="muted">{edge.relationship}</span> {edge.to} <span className="num">{fmt(edge.count)}</span>
            </button>
          ))}
        </div>
      )}

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
        {!ready && <div className="view-loading">{t("Laying out {n} nodes…", { n: fmt(elements.filter((element) => element.group === "nodes").length) })}</div>}
      </div>

      <p className="graph-stats">
        <strong>{showAll ? t("Whole:") : t("Part:")}</strong>{" "}
        {arrange === "focus" && ego ? (
          <>
            {t("{title} has {neighbours} neighbours over {relationships} relationships, in {groups} kinds.", {
              title: displayTitle(ego.seed), neighbours: fmt(ego.neighbours), relationships: fmt(ego.relationships), groups: fmt(ego.groups.length),
            })}{" "}
            {ego.groups.some((group) => group.hidden > 0)
              ? t("A few of each kind are named; click a dashed bubble to open the rest, or switch to all of the data.")
              : t("Everything it touches is drawn.")}{" "}
            {branches.length > 0 && t("The outer ring is what those neighbours reach in turn.")}{" "}
            {t("Click a record to move the centre there.")}
          </>
        ) : arrange === "schema" ? (
          <>
            {t("{types} types drawn; {open} opened into {records} records, {edges} relationships.", {
              types: fmt(schemaCounts.types), open: opened.size === 0 ? t("none") : [...opened].join(", "),
              records: fmt(schemaCounts.records), edges: fmt(schemaCounts.edges),
            })}{" "}
            {showAll ? t("Opening a type draws every record it has.") : t("Opening a type names its two busiest records and counts the rest; click the bubble to open them.")}{" "}
            {t("Click a type to open or close it.")}{" "}
          </>
        ) : (
          <>
            {t("{shown} of {total} entities and {edges} relationships drawn.", { shown: fmt(view.nodes.length), total: fmt(view.total), edges: fmt(view.edges.length) })}{" "}
            {view.total > view.nodes.length && t("The busiest are kept; switch to all of the data to see the rest.")}{" "}
          </>
        )}
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
