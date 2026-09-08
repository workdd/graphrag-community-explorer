/** A generator that repeats for the same seed text. */
export function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs fn with Math.random replaced by a seeded generator, so layouts repeat for the same input. */
export function withSeed<T>(seedText: string, fn: () => T): T {
  const original = Math.random;
  Math.random = seededRandom(seedText);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** Short stable hash for cache keys. */
export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
