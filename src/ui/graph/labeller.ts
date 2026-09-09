import type cytoscape from "cytoscape";
import { labelWidth, placeLabels, type LabelCandidate } from "../../core/graph/labels";

export interface LabellerOptions {
  /** Higher goes first when the screen is crowded. Community members and hubs rank above the rest. */
  priority?: (node: cytoscape.NodeSingular) => number;
  /** Names drawn at most, whatever the room. */
  limit?: number;
  /**
   * Smallest this node may be on screen, in pixels. A node the reader just picked out has to stay
   * findable when the whole graph is in view, where everything else is a couple of pixels across.
   */
  floor?: (node: cytoscape.NodeSingular) => number | undefined;
  /**
   * Smallest this node's name may be drawn, in screen pixels. The few nodes that carry the frame of
   * the picture are named at every zoom; everything else gives its name up as the crowd grows.
   */
  fontFloor?: (node: cytoscape.NodeSingular) => number | undefined;
}

export interface Labeller {
  /**
   * Places the names again, at once. Call it when the ranking has changed but the camera has not,
   * or before measuring what the names take up.
   */
  refresh: () => void;
  detach: () => void;
}

/**
 * Names appear as there is room for them. On every pan and zoom the visible nodes are measured in
 * screen pixels, the best are placed first and anything that would collide is left unnamed, so
 * zooming in reveals names rather than piling them on top of each other.
 */
export function attachLabeller(cy: cytoscape.Core, options: LabellerOptions = {}): Labeller {
  const limit = options.limit ?? 140;
  const priority = options.priority ?? ((node) => node.degree(false));
  const floor = options.floor ?? (() => undefined);
  const fontFloor = options.fontFloor ?? (() => undefined);
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
        let steady = 1 / Math.max(zoom, 1);
        const size = Number(node.data("size"));
        // A floor is given in screen pixels, so it is divided back through the zoom to reach the
        // model size that draws that many pixels.
        const least = floor(node);
        if (least !== undefined && Number.isFinite(size) && size > 0) {
          steady = Math.max(steady, least / (size * zoom));
        }
        let font = (Number(node.data("fontSize")) || 10) * steady;
        // A floor is given in screen pixels, so it is divided back through the zoom to reach the
        // model size that draws at that many pixels.
        const leastFont = fontFloor(node);
        if (leastFont !== undefined) font = Math.max(font, leastFont / zoom);
        if (on || leastFont !== undefined) node.style("font-size", font);
        if (Number.isFinite(size) && size > 0) node.style({ width: size * steady, height: size * steady });
      }
    });
  };

  const schedule = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(run);
  };

  cy.on("zoom pan resize", schedule);
  // The first pass is synchronous: a caller that wants to lay out around the names has to be able
  // to measure them straight after attaching.
  run();
  return {
    // Synchronous, because a caller that lays out around the names has to see them sized first.
    refresh: run,
    detach: () => {
      cy.off("zoom pan resize", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    },
  };
}
