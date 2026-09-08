import { describe, expect, it } from "vitest";
import { buildTree, depthOfLevel, levelsByDepth, levelsRenumbered, membershipIndex, pathTo, primaryCommunity } from "./hierarchy";
import type { Community, Partition } from "./model";

const community = (id: string, level: number, parentId: string | null, size: number, entityIds: string[] = []): Community => ({
  id, level, parentId, childIds: [], title: `C${id}`, entityIds, relationshipIds: [], size, membershipSource: "entity_ids", textUnitIds: [],
});
const partition = (list: Community[], rootLevel: number): Partition => ({
  id: "p", label: "p", communities: new Map(list.map((c) => [c.id, c])), levels: [...new Set(list.map((c) => c.level))].sort(), rootLevel,
});

describe("hierarchy", () => {
  const p = partition([
    community("0", 0, null, 10, ["a", "b"]),
    community("1", 1, "0", 6, ["a"]),
    community("2", 1, "0", 8, ["b"]),
    community("3", 2, "1", 2, ["a"]),
    community("9", 1, "missing", 1),
    community("x", 1, "y", 1),
    community("y", 1, "x", 1),
  ], 0);

  it("builds roots sorted by size, treats missing parents as roots and cuts cycles", () => {
    const tree = buildTree(p);
    expect(tree.map((n) => n.community.id)).toEqual(["0", "9"]);
    expect(tree[0].children.map((n) => n.community.id)).toEqual(["2", "1"]);
    expect(tree[0].children[1].children[0].community.id).toBe("3");
    expect(tree[0].children[1].children[0].depth).toBe(2);
  });

  it("returns the ancestor path and level depth", () => {
    expect(pathTo(p, "3").map((c) => c.id)).toEqual(["0", "1", "3"]);
    expect(pathTo(p, "x").map((c) => c.id)).toEqual(["y", "x"]);
    expect(depthOfLevel(p, 2)).toBe(2);
    expect(depthOfLevel({ ...p, rootLevel: 4 }, 2)).toBe(2);
  });

  it("picks the smallest community as primary membership", () => {
    const index = membershipIndex(p);
    expect(index.get("a")?.map((c) => c.id)).toEqual(["0", "1", "3"]);
    expect(primaryCommunity(index, "a")?.id).toBe("3");
    expect(primaryCommunity(index, "b")?.id).toBe("2");
    expect(primaryCommunity(index, "zzz")).toBeUndefined();
  });
});

describe("level numbering", () => {
  // Apache AGE resource tiers number the root highest; GraphRAG numbers it 0.
  const inverted: Partition = {
    id: "age", label: "AGE", rootLevel: 4, levels: [2, 3, 4],
    communities: new Map([
      ["a", { id: "a", level: 4, parentId: null, childIds: ["b"], title: "A", entityIds: [], relationshipIds: [], size: 0, membershipSource: "entity_ids", textUnitIds: [] }],
      ["b", { id: "b", level: 3, parentId: "a", childIds: ["c"], title: "B", entityIds: [], relationshipIds: [], size: 0, membershipSource: "entity_ids", textUnitIds: [] }],
      ["c", { id: "c", level: 2, parentId: "b", childIds: [], title: "C", entityIds: [], relationshipIds: [], size: 0, membershipSource: "entity_ids", textUnitIds: [] }],
    ]),
  };

  it("reads an inverted file from the root down", () => {
    expect(levelsByDepth(inverted)).toEqual([4, 3, 2]);
    expect(inverted.levels.map((l) => depthOfLevel(inverted, l))).toEqual([2, 1, 0]);
    expect(levelsRenumbered(inverted)).toBe(true);
  });

  it("leaves GraphRAG numbering untouched", () => {
    const plain: Partition = { ...inverted, rootLevel: 0, levels: [0, 1, 2] };
    expect(levelsByDepth(plain)).toEqual([0, 1, 2]);
    expect(levelsRenumbered(plain)).toBe(false);
  });
})
