import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { withSeed } from "./seed";

cytoscape.use(fcose);

export type LayoutProfile = "map" | "community";

export interface LayoutJob {
  id: number;
  profile: LayoutProfile;
  /** Nodes carry data.w / data.h (collapsed) or are compound parents; edges carry data.kind. */
  elements: cytoscape.ElementDefinition[];
  /** Keep the given positions and only relax, instead of starting from scratch. */
  incremental: boolean;
  seed: string;
}

export interface LayoutResult {
  id: number;
  positions: Record<string, { x: number; y: number }>;
  ms: number;
  error?: string;
}

/** fcose tuned per profile. Sizes come from node data because labels cannot be measured off-screen. */
function options(profile: LayoutProfile, incremental: boolean): cytoscape.LayoutOptions {
  const map = profile === "map";
  return {
    name: "fcose",
    quality: "default",
    randomize: !incremental,
    animate: false,
    fit: false,
    nodeDimensionsIncludeLabels: false,
    uniformNodeDimensions: false,
    packComponents: true,
    tile: true,
    tilingPaddingVertical: 28,
    tilingPaddingHorizontal: 28,
    // Community boxes carry a label inside them, so they need more room than a plain node.
    nodeRepulsion: (node: cytoscape.NodeSingular) => (node.data("kind") === "community" ? 48000 : node.hasClass("ghost") ? 2500 : 8000),
    idealEdgeLength: (edge: cytoscape.EdgeSingular) => {
      const kind = edge.data("kind");
      if (kind === "agg") return 170;
      if (kind === "agg-loose") return 300;
      if (kind === "plink") return 130;
      if (edge.hasClass("boundary")) return 55;
      return map ? 80 : 110;
    },
    edgeElasticity: (edge: cytoscape.EdgeSingular) => (edge.data("kind") === "agg" ? 0.15 : edge.data("kind") === "agg-loose" ? 0.05 : 0.4),
    nestingFactor: 0.1,
    gravity: map ? 0.3 : 0.2,
    gravityCompound: 1.1,
    gravityRange: 3.8,
    gravityRangeCompound: 1.5,
    numIter: 2500,
    initialEnergyOnIncremental: 0.3,
  } as unknown as cytoscape.LayoutOptions;
}

/** Runs headless; usable in a worker and, as a fallback, on the main thread. */
export function computeLayout(job: LayoutJob): LayoutResult {
  const started = performance.now();
  try {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: job.elements,
      style: [{ selector: "node", style: { width: "data(w)", height: "data(h)" } }] as unknown as cytoscape.StylesheetStyle[],
    });
    withSeed(job.seed, () => cy.layout(options(job.profile, job.incremental)).run());
    const positions: LayoutResult["positions"] = {};
    cy.nodes().not(":parent").forEach((node) => {
      const p = node.position();
      positions[node.id()] = { x: p.x, y: p.y };
    });
    cy.destroy();
    return { id: job.id, positions, ms: performance.now() - started };
  } catch (error) {
    return { id: job.id, positions: {}, ms: performance.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}
