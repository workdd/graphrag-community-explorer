const formatter = new Intl.NumberFormat("en-US");
export const fmt = (n: number): string => formatter.format(n);
export const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;
