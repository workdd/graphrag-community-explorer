import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { buildEvidenceGraph } from "../../core/search/evidenceGraph";
import type { SearchContext } from "../../core/search/types";
import { legibleZoomFor, zoomAfterFit } from "../map/legibility";
import { useT } from "../i18n";

cytoscape.use(fcose);

interface Props {
  context: SearchContext;
  /** Null while the run came from another index, where a record cannot be opened safely. */
  onOpenEntity: ((id: string) => void) | null;
}

// Typed loosely for the same reason as the other stylesheets here: the published types insist on
// strings for numeric properties that cytoscape itself accepts as numbers.
const NODE_FONT = 10;

const STYLE = [
  {
    selector: "node",
    style: {
      shape: "ellipse",
      width: "data(size)", height: "data(size)",
      "background-color": "#6b8f5e",
      label: "data(label)",
      "font-size": NODE_FONT,
      "text-valign": "bottom", "text-halign": "center", "text-margin-y": 4,
      "text-wrap": "ellipsis", "text-max-width": 120,
      "text-background-color": "#ffffff", "text-background-opacity": 0.85,
      "text-background-padding": 2, "text-background-shape": "roundrectangle",
      color: "#1b2430",
      "min-zoomed-font-size": 6,
    },
  },
  // A neighbour that was never ranked: it is on the far end of a link the model saw, nothing more.
  // It carries no label because a hundred names at this size read as a smudge; hovering names it.
  { selector: "node.outside", style: { "background-color": "#ffffff", "border-color": "#b9c6ae", "border-width": 1.5, "border-style": "dashed", label: "" } },
  { selector: "node.pick", style: { "border-color": "#3d5afe", "border-width": 3 } },
  { selector: "node.named", style: { label: "data(label)", "z-index": 12 } },
  {
    selector: "edge",
    style: {
      width: 1.2, "line-color": "#b8c0c8", "target-arrow-color": "#b8c0c8",
      "target-arrow-shape": "triangle", "arrow-scale": 0.7, "curve-style": "bezier", opacity: 0.85,
    },
  },
  { selector: "edge.hover", style: { "line-color": "#5f6b78", "target-arrow-color": "#5f6b78", label: "data(label)", "font-size": 10, "text-background-color": "#ffffff", "text-background-opacity": 0.9, "text-background-padding": 2, "z-index": 9 } },
] as unknown as cytoscape.StylesheetJson;

export function EvidenceGraph({ context, onOpenEntity }: Props) {
  const { t } = useT();
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [named, setNamed] = useState(false);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graph = useMemo(() => buildEvidenceGraph(context), [context]);

  useEffect(() => {
    if (!host.current || graph.nodes.length === 0) return;
    const degree = new Map<string, number>();
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const cy = cytoscape({
      container: host.current,
      style: STYLE,
      minZoom: 0.15,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autounselectify: true,
      elements: [
        ...graph.nodes.map((node) => ({
          data: { id: node.id, label: node.label, recordId: node.recordId, size: 12 + 10 * Math.sqrt(degree.get(node.id) ?? 0) },
          classes: node.kind === "outside" ? "outside" : "",
        })),
        ...graph.edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } })),
      ],
    });
    cy.layout({ name: "fcose", quality: "default", animate: false, nodeRepulsion: 9000, idealEdgeLength: 70, numIter: 1200 } as cytoscape.LayoutOptions).run();
    cy.fit(cy.elements(), 24);
    cyRef.current = cy;
    cy.on("mouseover", "edge", (e) => e.target.addClass("hover"));
    cy.on("mouseout", "edge", (e) => e.target.removeClass("hover"));
    // Hovering names an unlabelled neighbour without cluttering the drawing for everyone else.
    cy.on("mouseover", "node", (e) => { e.target.addClass("named"); setHover(String(e.target.data("label"))); });
    cy.on("mouseout", "node", (e) => { if (e.target.hasClass("outside")) e.target.removeClass("named"); setHover(null); });
    cy.on("tap", "node", (e) => {
      const id = e.target.data("recordId") as string | undefined;
      cy.nodes().removeClass("pick");
      e.target.addClass("pick");
      if (id && onOpenEntity) onOpenEntity(id);
    });
    return () => {
      cyRef.current = null;
      cy.destroy();
    };
  }, [graph, onOpenEntity]);

  // Names cost room: fitting a hundred records puts a 10px label at four pixels. Rather than choose
  // for the reader, the graph opens fitted and zooms to a readable level on request.
  const showNames = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = !named;
    setNamed(next);
    if (next) {
      const level = zoomAfterFit(legibleZoomFor(NODE_FONT), cy.maxZoom());
      cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    } else {
      cy.fit(cy.elements(), 24);
    }
  };

  if (graph.note === "reports-only") {
    return <p className="muted">{t("This answer came from community summaries only, so there is no record graph to draw.")}</p>;
  }
  if (graph.note === "none") return null;

  return (
    <div className="evidence-graph">
      <div className="row">
        <button className="btn" onClick={showNames}>{named ? t("Fit") : t("Zoom in for names")}</button>
      </div>
      <div ref={host} className="canvas" />
      <p className="muted">
        {graph.note === "no-links"
          ? t("The run carried no relationship between these records.")
          : t("{nodes} records and {edges} relationships went into the prompt. Dashed nodes were not ranked; they are the far end of a link. {hover}", {
              nodes: graph.nodes.length,
              edges: graph.edges.length,
              hover: hover ?? "",
            })}
      </p>
    </div>
  );
}
