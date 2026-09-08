// Global search: community reports in batches, one call per batch to pull out scored points, then
// one call to write the answer. Reports keep one number across every batch so a citation in the
// final answer still names a report the view can open.
import type { Partition } from "../model";
import { clip, estimateTokens } from "./budget";
import type { ContextItem } from "./types";

export interface ReportRef extends ContextItem {
  level: number;
}

export interface GlobalOptions {
  /** Community level to read. Null means every level the partition has. */
  level: number | null;
  batchTokens: number;
  maxFieldTokens: number;
  /** Points carried from the map calls into the final call. */
  maxPoints: number;
}

export const DEFAULT_GLOBAL: GlobalOptions = { level: null, batchTokens: 6000, maxFieldTokens: 500, maxPoints: 30 };

/** Reports at the chosen level, highest rank first, numbered once for the whole run. */
export function collectReports(partition: Partition | null, options: GlobalOptions): ReportRef[] {
  if (!partition) return [];
  const chosen = [...partition.communities.values()]
    .filter((community) => community.report !== undefined)
    .filter((community) => options.level === null || community.level === options.level)
    .sort((a, b) => (b.report?.rank ?? 0) - (a.report?.rank ?? 0) || b.size - a.size);
  return chosen.map((community, i) => {
    const text = `${community.title}: ${clip(community.report?.summary ?? "", options.maxFieldTokens)}`;
    return {
      id: community.id,
      shortId: String(i + 1),
      title: community.title,
      text,
      score: community.report?.rank,
      tokens: estimateTokens(text),
      level: community.level,
      raw: { id: community.id, level: community.level, rank: community.report?.rank, size: community.size },
    };
  });
}

/** Splits into batches that each fit the batch budget. A single oversized report gets its own batch. */
export function batchReports(reports: ReportRef[], batchTokens: number): ReportRef[][] {
  const batches: ReportRef[][] = [];
  let current: ReportRef[] = [];
  let tokens = 0;
  for (const report of reports) {
    const size = report.tokens ?? 0;
    if (current.length > 0 && tokens + size > batchTokens) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(report);
    tokens += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export const renderBatch = (batch: ReportRef[]): string =>
  batch.map((report) => `${report.shortId}. ${report.text}`).join("\n");

export interface MapPoint {
  description: string;
  score: number;
  reports: string[];
}

/** Reads the JSON a map call returned. Anything unparseable yields no points rather than a crash. */
export function parseMapPoints(raw: string): MapPoint[] {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const points = (parsed as { points?: unknown })?.points;
  if (!Array.isArray(points)) return [];
  return points
    .map((entry) => {
      const p = entry as { description?: unknown; score?: unknown; reports?: unknown };
      const description = typeof p.description === "string" ? p.description.trim() : "";
      const score = typeof p.score === "number" && Number.isFinite(p.score) ? p.score : 0;
      const reports = Array.isArray(p.reports) ? p.reports.map(String).filter((r) => r !== "") : [];
      return { description, score, reports };
    })
    .filter((point) => point.description !== "");
}

export const rankPoints = (points: MapPoint[], max: number): MapPoint[] =>
  [...points].sort((a, b) => b.score - a.score).slice(0, Math.max(0, max));

export const renderPoints = (points: MapPoint[]): string =>
  points
    .map((point) => `- ${point.description} [Data: Reports (${point.reports.join(", ")})]`)
    .join("\n");
