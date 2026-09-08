// Context has to fit the model's window, and the browser has no tokenizer. Everything here is an
// estimate; the views label it as one and the provider's own error is what stops a run that is
// still too large.

/** Hangul, CJK ideographs and kana cost about one token each; Latin text about four characters. */
const WIDE = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/u;

export function estimateTokens(text: string): number {
  if (text === "") return 0;
  let wide = 0;
  for (const ch of text) if (WIDE.test(ch)) wide += 1;
  const rest = [...text].length - wide;
  return Math.ceil(wide + rest / 4);
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
