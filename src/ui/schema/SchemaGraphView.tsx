import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { displayTitle, typeColors } from "../../core/graph/palette";
import { withSeed } from "../../core/graph/seed";
import { samplesForTriple, samplesForType, schemaGraph, type SchemaTripleEdge } from "../../core/graph/schemaGraph";
import type { Dataset } from "../../core/model";
import { fmt } from "../format";
import { useT } from "../i18n";

cytoscape.use(fcose);

interface Props {
  dataset: Dataset;
  onOpenType: (type: string) => void;
  onOpenTriple: (edge: SchemaTripleEdge) => void;
  onFocusEntity: (entityId: string) => void;
  onFocusRelationship: (relationshipId: string) => void;
}

type Picked = { kind: "type"; type: string } | { kind: "triple"; edge: SchemaTripleEdge } | null;

/** The shape of the index: entity types and the relationship triples that actually occur between them. */
export function SchemaGraphView({ dataset, onOpenType, onOpenTriple, onFocusEntity, onFocusRelationship }: Props) {
  const { t } = useT();
  const graph = useMemo(() => schemaGraph(dataset), [dataset]);
  const colors = useMemo(() => typeColors([...dataset.entities.values()].map((e) => e.type)), [dataset]);
  const [picked, setPicked] = useState<Picked>(null);
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);
  const pickRef = useRef(setPicked);
  pickRef.current = setPicked;

  useEffect(() => {
    if (!host.current) return;
    const biggest = Math.max(...graph.nodes.map((n) => n.entities), 1);
    const heaviest = Math.max(...graph.edges.map((e) => e.count), 1);
    const elements: cytoscape.ElementDefinition[] = [
      ...graph.nodes.map((node) => ({
        group: "nodes" as const,
        data: {
          id: `type:${node.type}`,
          type: node.type,
          label: `${node.type}\n${fmt(node.entities)}`,
          size: 34 + Math.sqrt(node.entities / biggest) * 46,
          color: colors.get(node.type) ?? "#8c96a0",
        },
      })),
      ...graph.edges.map((edge) => ({
        group: "edges" as const,
        classes: edge.loop ? "loop" : undefined,
        data: {
          id: edge.id,
          source: `type:${edge.from}`,
          target: `type:${edge.to}`,
          label: `${edge.relationship} ${fmt(edge.count)}`,
          width: 1 + (Math.log1p(edge.count) / Math.log1p(heaviest)) * 5,
        },
      })),
    ];
    const cy = withSeed(`schema:${graph.nodes.length}:${graph.edges.length}`, () =>
      cytoscape({
        container: host.current!,
        elements,
        style: [
          { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(color)", "background-opacity": 0.22, "border-width": 2, "border-color": "data(color)", label: "data(label)", "text-wrap": "wrap", "text-valign": "center", "font-size": 12, "line-height": 1.25, color: "#1b2430", "z-index": 10 } },
          { selector: "node.on", style: { "background-opacity": 0.45, "border-width": 3, "z-index": 20 } },
          { selector: "node.dim", style: { opacity: 0.25 } },
          { selector: "edge", style: { width: "data(width)", "line-color": "#b6bec7", "curve-style": "bezier", "target-arrow-shape": "triangle", "target-arrow-color": "#b6bec7", "arrow-scale": 0.9, label: "data(label)", "font-size": 10, color: "#5f6b78", "text-background-color": "#f3f4f1", "text-background-opacity": 0.85, "text-background-padding": "2px", "text-rotation": "autorotate", "min-zoomed-font-size": 7, "z-index": 1 } },
          { selector: "edge.loop", style: { "curve-style": "bezier", "loop-direction": "-45deg", "loop-sweep": "40deg", "line-style": "dashed" } },
          { selector: "edge.on", style: { "line-color": "#5a6fbe", "target-arrow-color": "#5a6fbe", color: "#5a6fbe", "z-index": 3 } },
          { selector: "edge.dim", style: { opacity: 0.15 } },
        ],
        layout: { name: "fcose", quality: "proof", randomize: true, animate: false, nodeRepulsion: 9000, idealEdgeLength: 110, nodeSeparation: 60, numIter: 2500 } as cytoscape.LayoutOptions,
        minZoom: 0.2,
        maxZoom: 3,
        boxSelectionEnabled: false,
        autounselectify: true,
      }),
    );
    cy.fit(cy.elements(), 24);
    // Shrinking further would make the type names unreadable; panning is better than guessing.
    if (cy.zoom() < 0.75) cy.zoom({ level: 0.75, position: { x: 0, y: 0 } });
    cy.on("tap", "node", (event) => pickRef.current({ kind: "type", type: event.target.data("type") as string }));
    cy.on("tap", "edge", (event) => {
      const edge = graph.edges.find((candidate) => candidate.id === event.target.id());
      if (edge) pickRef.current({ kind: "triple", edge });
    });
    cy.on("tap", (event) => {
      if (event.target === cy) pickRef.current(null);
    });
    cyRef.current = cy;
    if (import.meta.env.DEV) (window as unknown as { __cySchema?: cytoscape.Core }).__cySchema = cy;
    return () => {
      cy.destroy();
      cyRef.current = undefined;
    };
  }, [graph, colors]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("on dim");
      if (!picked) return;
      if (picked.kind === "type") {
        const node = cy.getElementById(`type:${picked.type}`);
        const near = node.closedNeighborhood();
        cy.elements().not(near).addClass("dim");
        node.addClass("on");
        node.connectedEdges().addClass("on");
      } else {
        const edge = cy.getElementById(picked.edge.id);
        const near = edge.connectedNodes().union(edge);
        cy.elements().not(near).addClass("dim");
        edge.addClass("on");
      }
    });
  }, [picked]);

  const typeSamples = useMemo(() => (picked?.kind === "type" ? samplesForType(dataset, picked.type) : []), [picked, dataset]);
  const tripleSamples = useMemo(() => (picked?.kind === "triple" ? samplesForTriple(dataset, picked.edge) : []), [picked, dataset]);
  const node = picked?.kind === "type" ? graph.nodes.find((n) => n.type === picked.type) : undefined;

  return (
    <div className="schema-graph">
      <div className="schema-graph-canvas" ref={host} />
      <aside className="schema-graph-side">
        {picked === null && (
          <>
            <h4>{t("{types} entity types, {triples} kinds of relationship between them", { types: fmt(graph.nodes.length), triples: fmt(graph.edges.length) })}</h4>
            <p className="muted">{t("Nothing declares this shape; it is counted from the rows. Click a type or an arrow to see the records behind it.")}</p>
            {graph.dangling > 0 && <p className="muted">{t("{n} relationships point at an entity the table does not have, so they are in no triple.", { n: fmt(graph.dangling) })}</p>}
            <ul className="schema-triples">
              {graph.edges.slice(0, 8).map((edge) => (
                <li key={edge.id}>
                  <button className="chip" onClick={() => setPicked({ kind: "triple", edge })}>
                    {edge.from} <span className="muted">{edge.relationship}</span> {edge.to} <span className="num">{fmt(edge.count)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {picked?.kind === "type" && node && (
          <>
            <h4>{node.type}</h4>
            <p className="muted">{t("{entities} entities, {relationships} relationships touching them.", { entities: fmt(node.entities), relationships: fmt(node.relationships) })}</p>
            <button className="btn primary" onClick={() => onOpenType(node.type)}>{t("Show these records in the graph")}</button>
            <h5>{t("Busiest records")}</h5>
            <ul className="schema-values">
              {typeSamples.map((entity) => (
                <li key={entity.id}>
                  <button className="value" onClick={() => onFocusEntity(entity.id)} title={entity.description ?? entity.title}>
                    <span className="value-title">{displayTitle(entity)}</span>
                    <span className="num">{fmt(entity.degree)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {picked?.kind === "triple" && (
          <>
            <h4>{picked.edge.from} <span className="muted">{picked.edge.relationship}</span> {picked.edge.to}</h4>
            <p className="muted">{t("{n} relationships of this shape.", { n: fmt(picked.edge.count) })}</p>
            <button className="btn primary" onClick={() => onOpenTriple(picked.edge)}>{t("Show these records in the graph")}</button>
            <h5>{t("Records")}</h5>
            <ul className="schema-values">
              {tripleSamples.map((sample) => (
                <li key={sample.relationship.id}>
                  <button className="value" onClick={() => onFocusRelationship(sample.relationship.id)} title={sample.relationship.description ?? ""}>
                    <span className="value-title">{displayTitle(sample.source)}</span>
                    <span className="value-arrow">→</span>
                    <span className="value-title">{displayTitle(sample.target)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
