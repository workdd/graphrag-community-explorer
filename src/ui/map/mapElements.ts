import type cytoscape from "cytoscape";
import { displayTitle } from "../../core/graph/palette";
import { UNASSIGNED_ID, communityKey, entityKey, type MapModel } from "../../core/graph/map";
import { depthOfLevel } from "../../core/hierarchy";
import type { Partition } from "../../core/model";
import { DEPTH_FILL } from "../graph/style";

export type Positions = Record<string, { x: number; y: number }>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Collapsed community boxes scale with the square root of their member count. */
export function boxSize(count: number): { w: number; h: number } {
  const w = clamp(Math.round(84 + 18 * Math.sqrt(count)), 84, 240);
  return { w, h: Math.round(w * 0.6) };
}

export function buildMapElements(model: MapModel, partition: Partition, colors: Map<string, string>, positions: Positions, labels = { unassigned: "Not in any community" }): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];
  const total = model.communities.length + model.entities.length + 1;
  const radius = 120 + 12 * total;
  let index = 0;
  const preset = (id: string) => {
    const angle = (2 * Math.PI * index++) / total;
    return positions[id] ?? { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  };

  for (const node of model.communities) {
    const { community, open, containerId } = node;
    const count = community.entityIds.length;
    const { w, h } = boxSize(count);
    const fill = DEPTH_FILL[Math.min(depthOfLevel(partition, community.level), DEPTH_FILL.length - 1)];
    elements.push({
      group: "nodes",
      data: {
        id: communityKey(community.id),
        kind: "community",
        communityId: community.id,
        label: open ? `${community.title} (${count})` : `${community.title}\n${count}`,
        title: community.title,
        level: community.level,
        count,
        fill,
        w,
        h,
        labelWidth: w - 10,
        parent: containerId ? communityKey(containerId) : undefined,
      },
      classes: open ? "container" : "collapsed",
      grabbable: !open,
      position: open ? undefined : preset(communityKey(community.id)),
    });
  }

  if (model.unassigned) {
    const { total: count, open } = model.unassigned;
    const { w, h } = boxSize(count);
    elements.push({
      group: "nodes",
      data: {
        id: UNASSIGNED_ID,
        kind: "community",
        communityId: UNASSIGNED_ID,
        label: open ? `${labels.unassigned} (${count})` : `${labels.unassigned}\n${count}`,
        title: labels.unassigned,
        count,
        fill: "#f3f4f1",
        w,
        h,
        labelWidth: w - 10,
      },
      classes: (open ? "container" : "collapsed") + " unassigned",
      grabbable: !open,
      position: open ? undefined : preset(UNASSIGNED_ID),
    });
  }

  const maxDegree = Math.max(1, ...model.entities.map((e) => e.entity.degree));
  for (const { entity, containerId } of model.entities) {
    elements.push({
      group: "nodes",
      data: {
        id: entityKey(entity.id),
        kind: "entity",
        entityId: entity.id,
        label: displayTitle(entity),
        title: entity.title,
        type: entity.type,
        color: colors.get(entity.type) ?? "#8c96a0",
        size: Math.round(12 + 16 * Math.sqrt(entity.degree / maxDegree)),
        w: Math.round(12 + 16 * Math.sqrt(entity.degree / maxDegree)) + 60,
        h: 26,
        parent: containerId === UNASSIGNED_ID ? UNASSIGNED_ID : communityKey(containerId),
      },
      classes: "entity",
      position: preset(entityKey(entity.id)),
    });
  }

  const maxCount = Math.max(1, ...model.aggregateEdges.map((e) => e.count));
  for (const edge of model.aggregateEdges) {
    const loose = edge.a === UNASSIGNED_ID || edge.b === UNASSIGNED_ID;
    elements.push({
      group: "edges",
      data: {
        id: `agg:${edge.a}|${edge.b}`,
        kind: loose ? "agg-loose" : "agg",
        source: edge.a,
        target: edge.b,
        count: edge.count,
        width: 1 + 7 * Math.log1p(edge.count) / Math.log1p(maxCount),
      },
      classes: loose ? "agg loose" : "agg",
    });
  }
  for (const relationship of model.entityEdges) {
    elements.push({
      group: "edges",
      data: {
        id: `e:${relationship.id}`,
        kind: "ee",
        relationshipId: relationship.id,
        source: entityKey(relationship.sourceId),
        target: entityKey(relationship.targetId),
        type: relationship.type,
      },
      classes: "ee",
    });
  }
  for (const link of model.parentLinks) {
    elements.push({
      group: "edges",
      data: { id: `plink:${link.childId}`, kind: "plink", source: communityKey(link.childId), target: communityKey(link.parentId), type: "child of" },
      classes: "plink",
    });
  }
  return elements;
}

/** What the layout needs: ids, parents, sizes, kinds. Positions of surviving nodes seed incremental runs. */
export function layoutInput(elements: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  return elements.map((el) => ({
    group: el.group,
    data: { id: el.data.id, parent: el.data.parent, source: el.data.source, target: el.data.target, kind: el.data.kind, w: el.data.w, h: el.data.h },
    classes: el.classes,
    position: el.position,
  }));
}
