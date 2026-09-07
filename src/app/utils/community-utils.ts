import { Community } from "../models/community";
import { CustomGraphData, CustomNode } from "../models/custom-graph-data";

export const UNCLUSTERED_COLOR = "#b8b8b8";

// Golden-angle hue steps keep neighbouring community numbers visually apart;
// alternating lightness adds contrast once hues start to repeat.
export const communityColor = (communityNumber: number): string => {
  const hue = Math.round((communityNumber * 137.508) % 360);
  return `hsl(${hue}, 70%, ${communityNumber % 2 === 0 ? 45 : 58}%)`;
};

// Type palette for the default mode: same generator, offset and less
// saturated so the two modes are told apart at a glance.
export const typeColor = (typeIndex: number): string =>
  `hsl(${Math.round((typeIndex * 137.508 + 60) % 360)}, 50%, 52%)`;

export interface Membership {
  primary: Community; // most specific: smallest size, then lowest number
  all: Community[];
}

// Hierarchy parents contain their children's hub, so the child (smaller) is
// the community that actually describes the entity.
export const buildMembership = (
  communities: Community[]
): Map<string, Membership> => {
  const byEntity = new Map<string, Community[]>();
  communities.forEach((community) => {
    (community.entity_ids ?? []).forEach((entityId) => {
      byEntity.set(entityId, [...(byEntity.get(entityId) ?? []), community]);
    });
  });
  const size = (c: Community) => c.size ?? c.entity_ids?.length ?? 0;
  const membership = new Map<string, Membership>();
  byEntity.forEach((all, entityId) => {
    const primary = [...all].sort(
      (a, b) => size(a) - size(b) || a.community - b.community
    )[0];
    membership.set(entityId, { primary, all });
  });
  return membership;
};

export const endpointId = (end: string | CustomNode): string =>
  typeof end === "object" ? end.id : end;

// Members are matched by entity uuid, so focus works whether or not the
// community node itself is currently drawn.
export const focusCommunity = (
  graph: CustomGraphData,
  communityNodeId: string,
  entityIds: string[]
): CustomGraphData => {
  const members = new Set(entityIds);
  const nodes = graph.nodes.filter(
    (node) =>
      node.id === communityNodeId ||
      members.has(node.uuid) ||
      (node.type === "FINDING" &&
        node.id.startsWith(`${communityNodeId}-finding-`))
  );
  const kept = new Set(nodes.map((node) => node.id));
  const links = graph.links.filter(
    (link) =>
      kept.has(endpointId(link.source)) && kept.has(endpointId(link.target))
  );
  return { nodes, links };
};

// Area grows with member count; sqrt keeps a 200-member hub ~3x the radius
// of an entity instead of 15x.
export const communityNodeVal = (node: CustomNode): number =>
  // A generous invisible hit target lets users grab the community outline
  // instead of hunting for a tiny center node.
  node.type === "COMMUNITY" ? 25 + Math.sqrt(node.size ?? 1) * 3 : 1;
