// Which names fit on screen right now. A graph drawn whole cannot show every name at once, so the
// names are placed in order of what matters and anything that would collide is left off. Zooming in
// spreads the nodes out, fewer boxes collide, and more names appear on their own.

export interface LabelCandidate {
  id: string;
  /** Centre of the node in screen pixels. */
  x: number;
  y: number;
  /** Size of the label box in screen pixels. */
  width: number;
  height: number;
  /** Higher goes first: what the reader needs named before anything else. */
  priority: number;
}

export interface LabelPlacement {
  /** Ids whose names are drawn. */
  shown: Set<string>;
  /** Candidates that were inside the viewport but had no room. */
  dropped: number;
}

/**
 * Greedy placement, best first: a name is drawn when its box clears every box already drawn.
 * The order decides what survives a crowd, so callers rank by what the picture is about.
 */
export function placeLabels(candidates: LabelCandidate[], limit = 140): LabelPlacement {
  const order = [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const placed: { x: number; y: number; width: number; height: number }[] = [];
  const shown = new Set<string>();
  let dropped = 0;
  for (const candidate of order) {
    if (shown.size >= limit) {
      dropped += 1;
      continue;
    }
    const box = {
      x: candidate.x - candidate.width / 2,
      y: candidate.y - candidate.height / 2,
      width: candidate.width,
      height: candidate.height,
    };
    const hits = placed.some(
      (other) =>
        box.x < other.x + other.width &&
        box.x + box.width > other.x &&
        box.y < other.y + other.height &&
        box.y + box.height > other.y,
    );
    if (hits) {
      dropped += 1;
      continue;
    }
    placed.push(box);
    shown.add(candidate.id);
  }
  return { shown, dropped };
}

/** Rough width of a label box in pixels; Korean and Latin differ enough to be worth separating. */
export function labelWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const character of text) units += character.charCodeAt(0) > 0x2e80 ? 1 : 0.55;
  return units * fontSize + 10;
}
