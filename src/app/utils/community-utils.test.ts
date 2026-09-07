import { Community } from "../models/community";
import { CustomGraphData, CustomNode } from "../models/custom-graph-data";
import {
  buildMembership,
  communityColor,
  communityNodeVal,
  focusCommunity,
  typeColor,
} from "./community-utils";

const community = (overrides: Partial<Community>): Community => ({
  id: 0,
  human_readable_id: 0,
  community: 0,
  parent: -1,
  level: 0,
  title: "c",
  entity_ids: [],
  relationship_ids: [],
  text_unit_ids: [],
  period: "",
  size: 0,
  ...overrides,
});

const node = (overrides: Partial<CustomNode>): CustomNode => ({
  uuid: "u",
  id: "n",
  name: "n",
  type: "VirtualMachine",
  ...overrides,
});

test("communityColor is deterministic and distinct for 24 communities", () => {
  const colors = Array.from({ length: 24 }, (_, i) => communityColor(i));
  expect(new Set(colors).size).toBe(24);
  expect(communityColor(3)).toBe(communityColor(3));
});

test("typeColor is distinct for 25 resource types", () => {
  const colors = Array.from({ length: 25 }, (_, i) => typeColor(i));
  expect(new Set(colors).size).toBe(25);
});

test("buildMembership picks the smallest community as primary and keeps all", () => {
  const child = community({ id: 10, community: 0, size: 10, entity_ids: ["e1", "e2"] });
  const parent = community({ id: 11, community: 4, size: 44, entity_ids: ["e1", "e3"] });
  const membership = buildMembership([parent, child]);
  expect(membership.get("e1")?.primary).toBe(child);
  expect(membership.get("e1")?.all).toEqual([parent, child]);
  expect(membership.get("e3")?.primary).toBe(parent);
  expect(membership.has("e9")).toBe(false);
});

test("buildMembership breaks size ties by community number", () => {
  const a = community({ id: 1, community: 7, size: 5, entity_ids: ["e"] });
  const b = community({ id: 2, community: 2, size: 5, entity_ids: ["e"] });
  expect(buildMembership([a, b]).get("e")?.primary).toBe(b);
});

test("focusCommunity keeps the hub, its members, findings and internal links only", () => {
  const hub = node({ uuid: "c1", id: "c1", type: "COMMUNITY", entity_ids: ["e1", "e2"] });
  const e1 = node({ uuid: "e1", id: "E1" });
  const e2 = node({ uuid: "e2", id: "E2" });
  const outsider = node({ uuid: "e3", id: "E3" });
  const finding = node({ uuid: "f", id: "c1-finding-0", type: "FINDING" });
  const otherFinding = node({ uuid: "g", id: "c2-finding-0", type: "FINDING" });
  const graph: CustomGraphData = {
    nodes: [hub, e1, e2, outsider, finding, otherFinding],
    links: [
      { id: "l1", source: "E1", target: "E2", type: "attachedToVM" },
      // force-graph replaces endpoints with node objects after the first render
      { id: "l2", source: e1 as any, target: hub as any, type: "IN_COMMUNITY" },
      { id: "l3", source: "E2", target: "E3", type: "attachedToVM" },
      { id: "l4", source: "c1", target: "c1-finding-0", type: "HAS_FINDING" },
    ],
  };
  const focused = focusCommunity(graph, "c1", ["e1", "e2"]);
  expect(focused.nodes).toEqual([hub, e1, e2, finding]);
  expect(focused.links.map((l) => l.id)).toEqual(["l1", "l2", "l4"]);
});

test("focusCommunity works without the community node drawn", () => {
  const graph: CustomGraphData = {
    nodes: [node({ uuid: "e1", id: "E1" }), node({ uuid: "e3", id: "E3" })],
    links: [{ id: "l", source: "E1", target: "E3", type: "x" }],
  };
  const focused = focusCommunity(graph, "c1", ["e1"]);
  expect(focused.nodes.map((n) => n.id)).toEqual(["E1"]);
  expect(focused.links).toEqual([]);
});

test("communityNodeVal grows with member count for community nodes only", () => {
  expect(communityNodeVal(node({ type: "COMMUNITY", size: 0 }))).toBeCloseTo(1);
  expect(communityNodeVal(node({ type: "COMMUNITY", size: 100 }))).toBeCloseTo(6);
  expect(communityNodeVal(node({ type: "COMMUNITY", size: 212 }))).toBeLessThan(9);
  expect(communityNodeVal(node({ size: 212 }))).toBe(1);
});
