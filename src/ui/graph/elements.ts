import type cytoscape from "cytoscape";
import { depthOfLevel } from "../../core/hierarchy";
import { displayTitle } from "../../core/graph/palette";
import type { Subgraph } from "../../core/graph/subgraph";
import type { Community, Partition } from "../../core/model";
import { withSeed } from "../../core/graph/seed";
import { DEPTH_FILL } from "./style";

export const nodeId = (entityId: string) => `n:${entityId}`;
export const edgeId = (relationshipId: string) => `e:${relationshipId}`;
export const parentId = (communityId: string) => `c:${communityId}`;

export interface ElementInput {
  subgraph: Subgraph;
  partition: Partition;
  communityIds: string[];
  colors: Map<string, string>;
  /** Positions from a previous render, keyed by entity id, so filter changes do not scramble the picture. */
  positions: Map<string, { x: number; y: number }>;
}

/** Cytoscape elements: one compound container per included community, members inside, ghosts outside. */
export function buildElements({ subgraph, partition, communityIds, colors, positions }: ElementInput): cytoscape.ElementDefinition[] {
  const included = communityIds.map((id) => partition.communities.get(id)).filter((c): c is Community => c !== undefined);
  const memberOf = new Map<string, Community>();
  for (const community of [...included].sort((a, b) => b.size - a.size)) {
    // Smallest community last so it wins when an entity sits in several included ones.
    for (const entityId of community.entityIds) memberOf.set(entityId, community);
  }
  const maxDegree = Math.max(1, ...subgraph.nodes.map((n) => n.entity.degree));
  const size = (degree: number) => Math.round(14 + 20 * Math.sqrt(degree / maxDegree));
  const total = subgraph.nodes.length;
  const radius = 60 + 9 * total;

  const elements: cytoscape.ElementDefinition[] = included.map((community) => ({
    group: "nodes",
    data: {
      id: parentId(community.id),
      communityId: community.id,
      label: `${community.title} (${community.entityIds.length})`,
      fill: DEPTH_FILL[Math.min(depthOfLevel(partition, community.level), DEPTH_FILL.length - 1)],
    },
    classes: "community",
    selectable: false,
    grabbable: false,
  }));

  subgraph.nodes.forEach((node, i) => {
    const { entity } = node;
    const owner = node.ghost ? undefined : memberOf.get(entity.id);
    const angle = (2 * Math.PI * i) / Math.max(1, total);
    elements.push({
      group: "nodes",
      data: {
        id: nodeId(entity.id),
        entityId: entity.id,
        label: displayTitle(entity),
        title: entity.title,
        type: entity.type,
        color: colors.get(entity.type) ?? "#8c96a0",
        size: node.ghost ? 12 : size(entity.degree),
        parent: owner ? parentId(owner.id) : undefined,
      },
      classes: node.ghost ? "ghost" : "",
      position: positions.get(entity.id) ?? { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
    });
  });

  for (const edge of subgraph.edges) {
    const { relationship } = edge;
    elements.push({
      group: "edges",
      data: {
        id: edgeId(relationship.id),
        relationshipId: relationship.id,
        source: nodeId(relationship.sourceId),
        target: nodeId(relationship.targetId),
        type: relationship.type,
      },
      classes: edge.boundary ? "boundary" : "",
    });
  }
  return elements;
}

/** fcose options. Incremental runs keep the previous positions and only relax; fresh runs get the spectral start. */
export function layoutOptions(nodeCount: number, incremental: boolean): cytoscape.LayoutOptions {
  return {
    name: "fcose",
    quality: nodeCount <= 300 ? "proof" : "default",
    randomize: !incremental,
    animate: false,
    fit: true,
    padding: 40,
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    packComponents: true,
    tile: true,
    tilingPaddingVertical: 14,
    tilingPaddingHorizontal: 14,
    // Ghost (outside) nodes sit close to the member they touch instead of being flung outward.
    nodeRepulsion: (node: cytoscape.NodeSingular) => (node.hasClass("ghost") ? 2500 : 9000),
    idealEdgeLength: (edge: cytoscape.EdgeSingular) => (edge.hasClass("boundary") ? 55 : 110),
    edgeElasticity: () => 0.4,
    nestingFactor: 0.1,
    gravity: 0.2,
    gravityCompound: 1.2,
    gravityRange: 3.8,
    gravityRangeCompound: 1.5,
    numIter: 2500,
    initialEnergyOnIncremental: 0.3,
  } as unknown as cytoscape.LayoutOptions;
}

/** Same input, same picture: the layout's random calls are fed from a seed derived from the node ids. Returns elapsed ms. */
export function runSeededLayout(cy: cytoscape.Core, options: cytoscape.LayoutOptions, seedText: string): number {
  const started = performance.now();
  withSeed(seedText, () => cy.layout(options).run());
  return performance.now() - started;
}

/** Frame the community containers; outside ghosts stay reachable by panning. */
export function fitToCommunities(cy: cytoscape.Core, animate = false): void {
  const parents = cy.nodes(":parent");
  const target = parents.empty() ? cy.elements() : parents;
  if (animate) cy.animate({ fit: { eles: target, padding: 36 } }, { duration: 250 });
  else cy.fit(target, 36);
}
