import { depthOfLevel } from "../core/hierarchy";
import type { Partition } from "../core/model";
import { useT } from "./i18n";

/**
 * Level numbers as a reader expects them: the root is L0 and children count up. GraphRAG numbers
 * levels that way already, so nothing changes for its output. Other producers number the root
 * highest (Apache AGE resource tiers) or start at one, and those are renumbered for display only.
 * The file's own number stays in the tooltip so a row can still be found in the Parquet.
 */
export function levelLabel(partition: Partition, level: number): string {
  return `L${depthOfLevel(partition, level)}`;
}

export function LevelTag({ partition, level }: { partition: Partition; level: number }) {
  const { t } = useT();
  const depth = depthOfLevel(partition, level);
  return (
    <span className="level-tag" data-depth={Math.min(depth, 4)} title={depth === level ? undefined : t("Level {level} in the file", { level })}>
      L{depth}
    </span>
  );
}
