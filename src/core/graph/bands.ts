// The whole community set on one page: a horizontal band per level, a circle per community sized by
// how many entities it holds, and a curve from every child to its parent. It answers "what is in
// this index and how does it nest" without asking anyone to open anything.
import { depthOfLevel, levelsByDepth } from "../hierarchy";
import { labelWidth } from "./labels";
import type { Community, Partition } from "../model";

export interface BandCircle {
  id: string;
  title: string;
  level: number;
  depth: number;
  size: number;
  x: number;
  y: number;
  r: number;
  parentId: string | null;
}

export interface Band {
  level: number;
  depth: number;
  y: number;
  height: number;
  communities: number;
  entities: number;
}

export interface BandLink {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface BandModel {
  bands: Band[];
  circles: BandCircle[];
  links: BandLink[];
  width: number;
  height: number;
}

export interface BandOptions {
  width?: number;
  bandHeight?: number;
  minRadius?: number;
  maxRadius?: number;
  gap?: number;
  /** Font the names are drawn at, which decides how much room each circle needs. */
  labelFontSize?: number;
  /** Characters kept of a name before it is cut. */
  labelChars?: number;
}

/**
 * Lays the levels out as bands from the root down, packs each band left to right and pulls every
 * community towards its parent so the curves stay short. Sizes are on a square root scale, which is
 * the one that reads as area rather than as length.
 */
export function bandLayout(partition: Partition, options: BandOptions = {}): BandModel {
  const width = options.width ?? 1180;
  const bandHeight = options.bandHeight ?? 92;
  const minRadius = options.minRadius ?? 9;
  const maxRadius = options.maxRadius ?? 34;
  const gap = options.gap ?? 10;
  const labelFontSize = options.labelFontSize ?? 9.5;
  const labelChars = options.labelChars ?? 18;

  const levels = levelsByDepth(partition);
  const byLevel = new Map<number, Community[]>();
  for (const community of partition.communities.values()) {
    const list = byLevel.get(community.level);
    if (list) list.push(community);
    else byLevel.set(community.level, [community]);
  }
  const sizeOf = (community: Community) => community.entityIds.length || community.size;
  const largest = Math.max(1, ...[...partition.communities.values()].map(sizeOf));
  const radius = (community: Community) =>
    Math.min(maxRadius, minRadius + (maxRadius - minRadius) * Math.sqrt(sizeOf(community) / largest));

  const placed = new Map<string, BandCircle>();
  const bands: Band[] = [];
  const circles: BandCircle[] = [];

  levels.forEach((level, index) => {
    const depth = depthOfLevel(partition, level);
    const members = (byLevel.get(level) ?? []).slice();
    const y = index * bandHeight + bandHeight / 2;
    bands.push({
      level,
      depth,
      y: index * bandHeight,
      height: bandHeight,
      communities: members.length,
      entities: members.reduce((sum, community) => sum + sizeOf(community), 0),
    });
    // Order by where the parent sits, so a child never has to reach across the picture.
    const anchor = (community: Community) => {
      const parent = community.parentId === null ? undefined : placed.get(community.parentId);
      return parent ? parent.x : Number.POSITIVE_INFINITY;
    };
    members.sort((a, b) => {
      const pa = anchor(a);
      const pb = anchor(b);
      if (pa !== pb) return pa - pb;
      return sizeOf(b) - sizeOf(a) || a.title.localeCompare(b.title);
    });
    // A circle needs room for its name as much as for itself, or the names run into each other.
    const slot = (community: Community) =>
      Math.max(radius(community) * 2, labelWidth(community.title.slice(0, labelChars), labelFontSize)) + gap;
    const total = members.reduce((sum, community) => sum + slot(community), 0) - gap;
    let cursor = Math.max(gap, (width - total) / 2);
    for (const community of members) {
      const r = radius(community);
      const room = slot(community);
      const circle: BandCircle = {
        id: community.id,
        title: community.title,
        level,
        depth,
        size: sizeOf(community),
        x: cursor + room / 2,
        y,
        r,
        parentId: community.parentId,
      };
      cursor += room;
      placed.set(community.id, circle);
      circles.push(circle);
    }
  });

  const links: BandLink[] = [];
  for (const circle of circles) {
    const parent = circle.parentId === null ? undefined : placed.get(circle.parentId);
    if (!parent) continue;
    links.push({ id: `${parent.id}>${circle.id}`, from: { x: parent.x, y: parent.y }, to: { x: circle.x, y: circle.y } });
  }

  const widest = circles.reduce((most, circle) => Math.max(most, circle.x + circle.r + gap), width);
  return { bands, circles, links, width: widest, height: bands.length * bandHeight };
}
