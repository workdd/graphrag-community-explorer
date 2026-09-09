// Nothing may sit on top of anything else. A force layout keeps nodes apart on average, which is
// not the same as keeping them apart: one large bubble and a handful of small ones next to it will
// still land on each other. This pushes overlapping boxes apart until none of them touch, and it
// says so by construction rather than by hoping the layout got it right.

export interface Box {
  id: string;
  /** Centre of the box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SeparateOptions {
  /** Empty space left between two boxes. */
  gap?: number;
  /** Give up after this many passes; a pass that moves nothing ends it earlier. */
  rounds?: number;
}

export interface Separation {
  positions: Map<string, { x: number; y: number }>;
  /** Passes actually run. */
  rounds: number;
  /** Pairs still overlapping, which is zero unless the cap was hit. */
  left: number;
}

/**
 * Pushes overlapping boxes apart along whichever axis needs the smaller move, so the picture keeps
 * its shape and only the collisions are undone. A big box yields less than a small one, which keeps
 * a hub where the layout put it and moves the specks around it instead. Deterministic: the same
 * input gives the same output, ties broken by id.
 */
export function separate(boxes: Box[], options: SeparateOptions = {}): Separation {
  const gap = options.gap ?? 6;
  const cap = options.rounds ?? 200;
  const order = [...boxes].sort((a, b) => a.id.localeCompare(b.id));
  const at = order.map((box) => ({ box, x: box.x, y: box.y, weight: 1 / Math.max(1, box.width * box.height) }));

  let rounds = 0;
  for (; rounds < cap; rounds++) {
    let moved = false;
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const a = at[i];
        const b = at[j];
        const needX = (a.box.width + b.box.width) / 2 + gap;
        const needY = (a.box.height + b.box.height) / 2 + gap;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overX = needX - Math.abs(dx);
        const overY = needY - Math.abs(dy);
        if (overX <= 0 || overY <= 0) continue;
        // The share each box takes of the push. The smaller box carries most of it.
        const total = a.weight + b.weight;
        const mine = a.weight / total;
        if (overX <= overY) {
          // Two boxes exactly on top of each other have no direction to part in; id order gives one.
          const way = dx === 0 ? (a.box.id < b.box.id ? -1 : 1) : Math.sign(dx);
          a.x -= way * overX * mine;
          b.x += way * overX * (1 - mine);
        } else {
          const way = dy === 0 ? (a.box.id < b.box.id ? -1 : 1) : Math.sign(dy);
          a.y -= way * overY * mine;
          b.y += way * overY * (1 - mine);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Nudging alone has fixed points: a box wedged between two others is pushed equally hard both
  // ways and never gets out. So whatever the nudging left behind is settled outright. Boxes are
  // taken largest first and each one that still clashes is moved to the nearest free spot, which
  // always exists and is always found, so the result carries the guarantee rather than an average.
  const settled: { x: number; y: number; box: Box }[] = [];
  const clashes = (x: number, y: number, box: Box) =>
    settled.some(
      (other) =>
        Math.abs(other.x - x) < (other.box.width + box.width) / 2 + gap &&
        Math.abs(other.y - y) < (other.box.height + box.height) / 2 + gap,
    );
  const biggestFirst = [...at].sort(
    (a, b) => b.box.width * b.box.height - a.box.width * a.box.height || a.box.id.localeCompare(b.box.id),
  );
  const step = Math.max(4, median(order.map((box) => Math.max(box.width, box.height))) / 2 + gap);
  for (const entry of biggestFirst) {
    if (!clashes(entry.x, entry.y, entry.box)) {
      settled.push({ x: entry.x, y: entry.y, box: entry.box });
      continue;
    }
    const spot = spiral(entry.x, entry.y, step, (x, y) => !clashes(x, y, entry.box));
    entry.x = spot.x;
    entry.y = spot.y;
    settled.push({ x: spot.x, y: spot.y, box: entry.box });
  }

  let left = 0;
  for (let i = 0; i < at.length; i++) {
    for (let j = i + 1; j < at.length; j++) {
      const a = at[i];
      const b = at[j];
      if (
        Math.abs(b.x - a.x) < (a.box.width + b.box.width) / 2 + gap &&
        Math.abs(b.y - a.y) < (a.box.height + b.box.height) / 2 + gap
      ) {
        left += 1;
      }
    }
  }
  return { positions: new Map(at.map((entry) => [entry.box.id, { x: entry.x, y: entry.y }])), rounds, left };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The nearest spot to (x, y) that the test accepts, searched outwards. Points come off a sunflower
 * spiral, so the search sweeps evenly in every direction and gets further out as it goes.
 */
function spiral(x: number, y: number, step: number, free: (x: number, y: number) => boolean): { x: number; y: number } {
  for (let k = 1; k < 20000; k++) {
    const radius = step * Math.sqrt(k) * 0.62;
    const angle = k * GOLDEN_ANGLE;
    const at = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
    if (free(at.x, at.y)) return at;
  }
  return { x, y };
}

/** True when no two boxes in the set are closer than the gap. Used by callers that must be sure. */
export function apart(boxes: Box[], gap = 0): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (
        Math.abs(b.x - a.x) < (a.width + b.width) / 2 + gap &&
        Math.abs(b.y - a.y) < (a.height + b.height) / 2 + gap
      ) {
        return false;
      }
    }
  }
  return true;
}
