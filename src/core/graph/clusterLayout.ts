// Communities placed as separate blobs with real gaps between them. A force layout pulls groups
// into each other whenever they share an edge, so the positions here are computed instead: each
// community is packed into a disc of its own, and the discs are laid out in rows. The result is the
// same every time and the gaps are guaranteed rather than hoped for.

export interface ClusterGroup {
  id: string;
  /** Member ids, in the order they should be packed: busiest first reads best. */
  members: string[];
}

export interface ClusterPlacement {
  id: string;
  /** Centre of the disc. */
  x: number;
  y: number;
  radius: number;
  members: number;
}

export interface ClusterLayout {
  positions: Record<string, { x: number; y: number }>;
  groups: ClusterPlacement[];
  width: number;
  height: number;
}

export interface ClusterOptions {
  /** Distance between neighbouring members inside a community. */
  spacing?: number;
  /** Empty space left between two communities. */
  gap?: number;
  /** Rows wrap once they pass this width. */
  targetWidth?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Sunflower packing: n points spread evenly over a disc, densest in the middle. */
function disc(count: number, spacing: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const radius = spacing * 0.62 * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

/**
 * Packs every community into its own disc and lays the discs out in rows, biggest first. Nothing
 * here depends on the relationships, which is the point: two communities that talk to each other a
 * lot still get to sit apart.
 */
export function clusterLayout(groups: ClusterGroup[], options: ClusterOptions = {}): ClusterLayout {
  const spacing = options.spacing ?? 34;
  const gap = options.gap ?? 90;
  const targetWidth = options.targetWidth ?? 2600;

  const sized = groups
    .filter((group) => group.members.length > 0)
    .map((group) => {
      const points = disc(group.members.length, spacing);
      const radius = Math.max(spacing * 0.8, ...points.map((point) => Math.hypot(point.x, point.y))) + spacing * 0.7;
      return { group, points, radius };
    })
    .sort((a, b) => b.radius - a.radius || a.group.id.localeCompare(b.group.id));

  const positions: Record<string, { x: number; y: number }> = {};
  const placed: ClusterPlacement[] = [];
  let rowTop = 0;
  let cursor = 0;
  let rowHeight = 0;
  for (const entry of sized) {
    const diameter = entry.radius * 2;
    if (cursor > 0 && cursor + diameter > targetWidth) {
      rowTop += rowHeight + gap;
      cursor = 0;
      rowHeight = 0;
    }
    const centre = { x: cursor + entry.radius, y: rowTop + entry.radius };
    entry.group.members.forEach((id, index) => {
      const point = entry.points[index];
      positions[id] = { x: centre.x + point.x, y: centre.y + point.y };
    });
    placed.push({ id: entry.group.id, x: centre.x, y: centre.y, radius: entry.radius, members: entry.group.members.length });
    cursor += diameter + gap;
    rowHeight = Math.max(rowHeight, diameter);
  }
  const width = placed.reduce((most, group) => Math.max(most, group.x + group.radius), 0);
  const height = rowTop + rowHeight;
  return { positions, groups: placed, width, height };
}
