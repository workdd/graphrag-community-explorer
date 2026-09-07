/** Hands the viewer a file. Works in every browser without a server round trip. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, text: string, type = "text/plain;charset=utf-8"): void {
  downloadBlob(name, new Blob([text], { type }));
}

/** RFC 4180-ish: quotes fields that contain separators, quotes or line breaks. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** File-name-safe slice of a title. */
export const safeName = (title: string): string => title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "export";

/** PNG of a Cytoscape canvas at 2x, whole graph, white background. */
export function exportCytoscapePng(cy: { png: (o: { full: boolean; scale: number; bg: string; output: "blob" }) => Blob }, name: string): void {
  downloadBlob(`${name}.png`, cy.png({ full: true, scale: 2, bg: "#ffffff", output: "blob" }));
}
