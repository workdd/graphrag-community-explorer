import type { Entity } from "../model";

/** Categorical colors for entity types: saturated enough to read at 8px, distinct from the indigo accent. */
const TYPE_COLORS = [
  "#1f7a8c", "#e07a2f", "#6c8f2a", "#b4478f", "#8a6d3b", "#2c9c74",
  "#c8453c", "#4c6eb1", "#a67c00", "#7c4dbf", "#3a8f9f", "#d1567a",
];

/** Types are colored in alphabetical order so the same dataset always gets the same legend. */
export function typeColors(types: Iterable<string>): Map<string, string> {
  const sorted = [...new Set(types)].sort((a, b) => a.localeCompare(b));
  return new Map(sorted.map((type, i) => [type, i < TYPE_COLORS.length ? TYPE_COLORS[i] : `hsl(${Math.round((i * 137.508) % 360)}, 55%, 45%)`]));
}

/** Label text: drops export suffixes like "[AGE:…]" and a redundant "Type · " prefix. Full titles stay in tooltips. */
export function displayTitle(entity: Pick<Entity, "title" | "type">): string {
  let title = entity.title.replace(/\s*\[AGE:[^\]]*\]\s*$/, "");
  const prefix = `${entity.type} · `;
  if (title.startsWith(prefix)) title = title.slice(prefix.length);
  return title || entity.title;
}
