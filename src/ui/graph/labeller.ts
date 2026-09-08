import type cytoscape from "cytoscape";
import { labelWidth, placeLabels, type LabelCandidate } from "../../core/graph/labels";

export interface LabellerOptions {
  /** Higher goes first when the screen is crowded. Community members and hubs rank above the rest. */
  priority?: (node: cytoscape.NodeSingular) => number;
  /** Names drawn at most, whatever the room. */
  limit?: number;
}

/**
 * Names appear as there is room for them. On every pan and zoom the visible nodes are measured in
 * screen pixels, the best are placed first and anything that would collide is left unnamed, so
 * zooming in reveals names rather than piling them on top of each other. Returns a detach function.
 */
export function attachLabeller(cy: cytoscape.Core, options: LabellerOptions = {}): () => void {
  const limit = options.limit ?? 140;
  const priority = options.priority ?? ((node) => node.degree(false));
  let frame: number | undefined;

  const run = () => {
    frame = undefined;
    const extent = cy.extent();
    const zoom = cy.zoom();
    const candidates: LabelCandidate[] = [];
    const outside: cytoscape.NodeSingular[] = [];
    for (const node of cy.nodes()) {
      if (node.isParent() || node.hasClass("band")) continue;
      const position = node.position();
      // Off-screen nodes cannot collide with anything drawn, and cost nothing to leave unnamed.
      if (position.x < extent.x1 || position.x > extent.x2 || position.y < extent.y1 || position.y > extent.y2) {
        outside.push(node);
        continue;
      }
      const text = String(node.data("label") ?? "");
      if (text === "") continue;
      const lines = text.split("\n");
      // The box is measured in screen pixels at a size that does not change with zoom, which is what
      // makes zooming in reveal names: the nodes spread out while the names stay the same size.
      const base = Number(node.data("fontSize")) || 10;
      const rendered = node.renderedPosition();
      candidates.push({
        id: node.id(),
        x: rendered.x,
        y: rendered.y + (node.renderedHeight() / 2) * 1.1,
        width: Math.max(...lines.map((line) => labelWidth(line, base))),
        height: lines.length * base * 1.35 + 4,
        priority: priority(node),
      });
    }
    const { shown } = placeLabels(candidates, limit);
    cy.batch(() => {
      for (const node of outside) node.addClass("nolabel");
      for (const candidate of candidates) {
        const node = cy.getElementById(candidate.id);
        const on = shown.has(candidate.id);
        node.toggleClass("nolabel", !on);
        // Cytoscape scales everything with the view. Zooming in should spread the picture out, not
        // magnify it, so the text and the dots are divided back down to a steady size on screen.
        const steady = 1 / Math.max(zoom, 1);
        if (on) node.style("font-size", (Number(node.data("fontSize")) || 10) * steady);
        const size = Number(node.data("size"));
        if (Number.isFinite(size) && size > 0) node.style({ width: size * steady, height: size * steady });
      }
    });
  };

  const schedule = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(run);
  };

  cy.on("zoom pan resize", schedule);
  schedule();
  return () => {
    cy.off("zoom pan resize", schedule);
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
