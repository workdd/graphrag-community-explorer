// Same index or not. A trace and an embeddings file both name the Parquet bytes they were made
// from, so a result from another index is never quietly drawn onto the graph in front of you.

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return `sha256:${hex(digest)}`;
}

export type Fingerprints = Record<string, string>;

/** Names present on both sides that disagree. An absent name is not a disagreement. */
export function mismatches(expected: Fingerprints, actual: Fingerprints): string[] {
  return Object.keys(expected)
    .filter((name) => actual[name] !== undefined && actual[name] !== expected[name])
    .sort();
}

export const matches = (expected: Fingerprints, actual: Fingerprints): boolean =>
  mismatches(expected, actual).length === 0;
