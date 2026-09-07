import { describe, expect, it } from "vitest";
import { buildTree, depthOfLevel, membershipIndex, pathTo, primaryCommunity } from "./hierarchy";
import type { Community, Partition } from "./model";

const community = (id: string, level: number, parentId: string | null, size: number, entityIds: string[] = []): Community => ({
  id, level, parentId, childIds: [], title: `C${id}`, entityIds, relationshipIds: [], size, membershipSource: "entity_ids",
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
