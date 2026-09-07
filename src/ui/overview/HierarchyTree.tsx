import { useMemo, useState } from "react";
import { buildTree, depthOfLevel, type TreeNode } from "../../core/hierarchy";
import type { Partition } from "../../core/model";
import { fmt } from "../format";

interface Props {
  partition: Partition;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HierarchyTree({ partition, selectedId, onSelect }: Props) {
  const tree = useMemo(() => buildTree(partition), [partition]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const matches = (node: TreeNode): boolean =>
    needle === "" || node.community.title.toLowerCase().includes(needle) || node.children.some(matches);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const render = (node: TreeNode) => {
    if (!matches(node)) return null;
    const { community } = node;
    const open = needle !== "" || !collapsed.has(community.id);
    return (
      <li key={community.id}>
        <div
          className={`tree-row${community.id === selectedId ? " selected" : ""}`}
          data-depth={Math.min(node.depth, 4)}
          style={{ paddingLeft: 6 + node.depth * 14 }}
        >
          {node.children.length > 0 ? (
            <button className="caret" aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} onClick={() => toggle(community.id)}>
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="caret-spacer" />
          )}
          <button className="tree-label" onClick={() => onSelect(community.id)}>
            <span className="level-tag" data-depth={Math.min(depthOfLevel(partition, community.level), 4)}>L{community.level}</span>
            <span className="tree-title" title={community.title}>{community.title}</span>
            <span className="tree-size num">{fmt(community.entityIds.length)}</span>
          </button>
        </div>
        {open && node.children.length > 0 && <ul>{node.children.map(render)}</ul>}
      </li>
    );
  };

  return (
    <div className="tree">
      <input className="field" placeholder="Find a community" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a community" />
      <div className="tree-meta">
        {fmt(tree.length)} top-level, {fmt(partition.communities.size)} in total. Numbers are entity counts.
      </div>
      <ul className="tree-root">{tree.map(render)}</ul>
    </div>
  );
}
