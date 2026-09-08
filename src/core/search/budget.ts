// Context has to fit the model's window, and the browser has no tokenizer. Everything here is an
// estimate; the views label it as one and the provider's own error is what stops a run that is
// still too large.

const WORD = /[A-Za-z0-9]/;
const SPACE = /\s/;

/** A run of letters and digits costs about one token per four characters, and never less than one. */
const runCost = (run: number): number => (run === 0 ? 0 : Math.ceil(run / 4));

/**
 * Tokenizers split on punctuation, so braces, quotes and colons each cost roughly a token of their
 * own, and Hangul or CJK costs about one token a character. Pricing symbols at four characters a
 * token undercounts JSON by about half, and an index that stores raw property JSON as its entity
 * descriptions is a quarter punctuation: measured on this data, an 8,000 token budget produced a
 * 14,765 token prompt.
 */
export function estimateTokens(text: string): number {
  if (text === "") return 0;
  let tokens = 0;
  let run = 0;
  for (const ch of text) {
    if (WORD.test(ch)) {
      run += 1;
      continue;
    }
    tokens += runCost(run);
    run = 0;
    if (SPACE.test(ch)) continue;
    tokens += 1; // a wide character or a symbol, both about one token
  }
  return tokens + runCost(run);
}

export interface Group<T> {
  key: string;
  items: T[];
}

export interface Filled<T> {
  key: string;
  taken: T[];
  /** Items left out because the budget ran out. */
  dropped: number;
  tokens: number;
}

export interface FillResult<T> {
  groups: Filled<T>[];
  tokens: number;
  /** True when at least one item did not fit. */
  truncated: boolean;
}

/**
 * Fills the budget group by group in the order given. A group that does not fit is not skipped
 * whole: its items are taken until the budget runs out, so the highest priority group always gets
 * what it can. Ordering inside a group is the caller's business.
 */
export function fill<T>(groups: Group<T>[], cost: (item: T) => number, budget: number): FillResult<T> {
  let left = Math.max(0, budget);
  let truncated = false;
  const out: Filled<T>[] = [];
  for (const group of groups) {
    const taken: T[] = [];
    let tokens = 0;
    let dropped = 0;
    for (const item of group.items) {
      const size = Math.max(0, cost(item));
      if (size <= left) {
        taken.push(item);
        tokens += size;
        left -= size;
      } else {
        dropped += 1;
      }
    }
    if (dropped > 0) truncated = true;
    out.push({ key: group.key, taken, dropped, tokens });
  }
  return { groups: out, tokens: out.reduce((s, g) => s + g.tokens, 0), truncated };
}

/** Cuts a long field so one oversized description cannot eat the whole budget. */
export function clip(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}
