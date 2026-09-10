import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { buildEvidenceGraph, edgeKeyFor, neighbourhoodOf, nodeKeyFor } from "../../core/search/evidenceGraph";
import type { CitedShortIds, Selection } from "../../core/search/highlight";
import type { SearchContext } from "../../core/search/types";
import { useT } from "../i18n";
import { readableTitle } from "./label";

cytoscape.use(fcose);

interface Props {
  context: SearchContext;
  /** Numbers the answer pointed at. These are drawn in the accent and always carry a label. */
  cited: CitedShortIds;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

const NODE_FONT = 11;

// Three states, because "reached the prompt" and "the answer used it" are different facts:
// cited is the accent, retrieved is plain, and a node that is only the far end of a link is faint.
const STYLE = [
  {
    selector: "node",
    style: {
      shape: "ellipse",
      width: "data(size)", height: "data(size)",
      "background-color": "#a9b89c",
      label: "",
      "font-size": NODE_FONT, "font-weight": 600,
      "text-valign": "bottom", "text-halign": "center", "text-margin-y": 4,
      "text-wrap": "ellipsis", "text-max-width": 130,
      "text-background-color": "#ffffff", "text-background-opacity": 0.9,
      "text-background-padding": 2, "text-background-shape": "roundrectangle",
      color: "#1b2430",
      "min-zoomed-font-size": 0,
      "transition-property": "opacity", "transition-duration": 120,
    },
  },
  { selector: "node.outside", style: { "background-color": "#ffffff", "border-color": "#c8d0c2", "border-width": 1.5, "border-style": "dashed" } },
  { selector: "node.cited", style: { "background-color": "#6b8f5e", "border-color": "#a3423c", "border-width": 3, label: "data(label)", "z-index": 10 } },
  { selector: "node.pick", style: { "border-color": "#3d5afe", "border-width": 4, label: "data(label)", "z-index": 20 } },
  { selector: "node.named", style: { label: "data(label)", "z-index": 15 } },
  { selector: "node.dim", style: { opacity: 0.12, label: "" } },
  {
    selector: "edge",
    style: {
      width: 1.2, "line-color": "#c2c9d0", "target-arrow-color": "#c2c9d0",
      "target-arrow-shape": "triangle", "arrow-scale": 0.7, "curve-style": "bezier", opacity: 0.8,
      "transition-property": "opacity", "transition-duration": 120,
    },
  },
  { selector: "edge.cited", style: { "line-color": "#a3423c", "target-arrow-color": "#a3423c", width: 2.4, opacity: 1, "z-index": 9 } },
  { selector: "edge.pick", style: { "line-color": "#3d5afe", "target-arrow-color": "#3d5afe", width: 3, label: "data(label)", "font-size": 10, "text-background-color": "#ffffff", "text-background-opacity": 0.9, "text-background-padding": 2, "z-index": 19 } },
  { selector: "edge.hover", style: { label: "data(label)", "font-size": 10, "text-background-color": "#ffffff", "text-background-opacity": 0.9, "text-background-padding": 2, "z-index": 18 } },
  { selector: "edge.dim", style: { opacity: 0.06, label: "" } },
] as unknown as cytoscape.StylesheetStyle[];

export function EvidenceGraph({ context, cited, selection, onSelect }: Props) {
  const { t } = useT();
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graph = useMemo(() => buildEvidenceGraph(context), [context]);

  useEffect(() => {
    if (!host.current || graph.nodes.length === 0) return;
    const degree = new Map<string, number>();
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const citedEdgeKeys = new Set(
      [...cited.relationships].map((shortId) => edgeKeyFor(graph, shortId)).filter((k): k is string => k !== null),
    );
    const cy = cytoscape({
      container: host.current,
      style: STYLE,
      minZoom: 0.1,
      maxZoom: 4,
      boxSelectionEnabled: false,
      autounselectify: true,
      elements: [
        ...graph.nodes.map((node) => ({
          data: {
            id: node.id, label: readableTitle(node.label), shortId: node.shortId,
            size: 12 + 11 * Math.sqrt(degree.get(node.id) ?? 0),
          },
          classes: [
            node.kind === "outside" ? "outside" : "",
            node.shortId !== undefined && cited.entities.has(node.shortId) ? "cited" : "",
          ].filter(Boolean).join(" "),
        })),
        ...graph.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label, shortId: edge.shortId },
          classes: citedEdgeKeys.has(edge.id) ? "cited" : "",
        })),
      ],
    });
    cy.layout({ name: "fcose", quality: "default", animate: false, nodeRepulsion: 11000, idealEdgeLength: 80, numIter: 1400 } as cytoscape.LayoutOptions).run();
    // Open on what the answer used. Fitting all hundred records puts every label below reading size.
    const focus = cy.elements(".cited");
    cy.fit(focus.length > 0 ? focus.closedNeighborhood() : cy.elements(), 30);
    cyRef.current = cy;

    cy.on("mouseover", "edge", (e) => e.target.addClass("hover"));
    cy.on("mouseout", "edge", (e) => e.target.removeClass("hover"));
    cy.on("mouseover", "node", (e) => e.target.addClass("named"));
    cy.on("mouseout", "node", (e) => e.target.removeClass("named"));
    cy.on("tap", "node", (e) => {
      const shortId = e.target.data("shortId") as string | undefined;
      onSelect(shortId === undefined ? null : { kind: "entities", shortId });
    });
    cy.on("tap", "edge", (e) => onSelect({ kind: "relationships", shortId: String(e.target.data("shortId")) }));
    cy.on("tap", (e) => {
      if (e.target === cy) onSelect(null);
    });
    return () => {
      cyRef.current = null;
      cy.destroy();
    };
  }, [graph, cited, onSelect]);

  // Selection only changes emphasis; rebuilding the layout on every click would move the picture
  // under the reader's hand.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("pick dim");
    if (!selection) return;
    const nodeKey = nodeKeyFor(graph, selection.kind, selection.shortId);
    const edgeKey = selection.kind === "relationships" ? edgeKeyFor(graph, selection.shortId) : null;
    const anchor = edgeKey ? cy.getElementById(edgeKey).source().id() : nodeKey;
    if (!anchor) return;
    const lit = neighbourhoodOf(graph, anchor);
    cy.nodes().forEach((node) => { if (!lit.nodes.has(node.id())) node.addClass("dim"); });
    cy.edges().forEach((edge) => { if (!lit.edges.has(edge.id())) edge.addClass("dim"); });
    if (edgeKey) cy.getElementById(edgeKey).addClass("pick").removeClass("dim");
    else if (nodeKey) cy.getElementById(nodeKey).addClass("pick").removeClass("dim");
  }, [selection, graph]);

  if (graph.note === "reports-only") {
    return <p className="muted">{t("This answer came from community summaries only, so there is no record graph to draw.")}</p>;
  }
  if (graph.note === "none") return null;

  return (
    <div className="graph-pane">
      <div ref={host} className="canvas" role="img" aria-label={t("Evidence graph")} />
      <div className="legend">
        <span><i className="dot cited" /> {t("Cited by the answer")}</span>
        <span><i className="dot plain" /> {t("Sent to the model")}</span>
        <span><i className="dot outside" /> {t("Far end of a link")}</span>
        <button className="btn" onClick={() => { onSelect(null); cyRef.current?.fit(cyRef.current.elements(), 30); }}>
          {t("Fit")}
        </button>
      </div>
    </div>
  );
}
