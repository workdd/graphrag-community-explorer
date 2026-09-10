import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { classifyFile, currentNames, isExampleRun, manifestFiles, readExampleRun } from "./files";

describe("classifyFile", () => {
  it("maps GraphRAG file names of every version to tables", () => {
    expect(classifyFile("output/entities.parquet")).toEqual({ table: "entities" });
    expect(classifyFile("create_final_relationships.parquet")).toEqual({ table: "relationships" });
    expect(classifyFile("Create_Final_Communities.parquet")).toEqual({ table: "communities" });
    expect(classifyFile("community_reports.parquet")).toEqual({ table: "community_reports" });
  });

  it("treats <label>_communities.parquet as an extra partition and ignores other files", () => {
    expect(classifyFile("leiden_communities.parquet")).toEqual({ partition: "leiden" });
    expect(classifyFile("text_units.parquet")).toEqual({ table: "text_units" });
    expect(classifyFile("create_final_documents.parquet")).toEqual({ table: "documents" });
    expect(classifyFile("covariates.parquet")).toEqual({ table: "covariates" });
    expect(classifyFile("notes.txt")).toBeNull();
  });
});

describe("a community set brought alongside the index", () => {
  it("recognizes its summaries and does not read them as another set", () => {
    expect(classifyFile("recluster_community_reports.parquet")).toEqual({ reports: "recluster" });
    expect(classifyFile("recluster_communities.parquet")).toEqual({ partition: "recluster" });
  });

  it("keeps the index's own reports canonical", () => {
    expect(classifyFile("community_reports.parquet")).toEqual({ table: "community_reports" });
    expect(classifyFile("create_final_community_reports.parquet")).toEqual({ table: "community_reports" });
  });

  it("ignores a name that only looks like one", () => {
    expect(classifyFile("reports.parquet")).toBeNull();
    expect(classifyFile("community_reports_backup.parquet")).toBeNull();
  });
});

describe("a saved run left in the index folder", () => {
  const answer = (body: string | null, type = "application/json", ok = true) =>
    vi.fn().mockResolvedValue({
      ok,
      headers: { get: () => type },
      text: async () => body ?? "",
    });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is recognized by name, whatever the folder or the case", () => {
    expect(isExampleRun("example-run.json")).toBe(true);
    expect(isExampleRun("output/Example-Run.JSON")).toBe(true);
    expect(isExampleRun("example-run.parquet")).toBe(false);
    expect(isExampleRun("run.json")).toBe(false);
  });

  it("is not one of the index tables, so it is never fingerprinted as data", () => {
    expect(classifyFile("example-run.json")).toBeNull();
  });

  it("comes back as text when the folder has one", async () => {
    vi.stubGlobal("fetch", answer('{"schemaVersion":"1.0"}'));
    await expect(readExampleRun("/data/demo")).resolves.toBe('{"schemaVersion":"1.0"}');
  });

  it("is simply absent when the folder has none", async () => {
    vi.stubGlobal("fetch", answer(null, "application/json", false));
    await expect(readExampleRun("/data/demo")).resolves.toBeUndefined();
  });

  it("is absent when a dev server answers with its index page instead", async () => {
    vi.stubGlobal("fetch", answer("<!doctype html>", "text/html"));
    await expect(readExampleRun("/data/demo")).resolves.toBeUndefined();
  });

  it("never stops the index from loading when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(readExampleRun("/data/demo")).resolves.toBeUndefined();
  });
});

describe("guessing what a hosted folder holds", () => {
  it("tries the names a current run writes, one per table", () => {
    const names = currentNames();
    expect(names).toContain("entities.parquet");
    expect(names).toContain("community_reports.parquet");
    // Never both generations at once: an index is one or the other.
    expect(names.some((name) => name.startsWith("create_final_"))).toBe(false);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reads a manifest that lists extras as extras", () => {
    expect(manifestFiles({ files: ["leiden_communities.parquet"] })).toEqual({
      files: ["leiden_communities.parquet"],
      complete: false,
    });
  });

  it("takes a manifest that names the entities file as the whole folder", () => {
    const listed = manifestFiles({ files: ["entities.parquet", "relationships.parquet"] });
    expect(listed.complete).toBe(true);
    expect(listed.files).toEqual(["entities.parquet", "relationships.parquet"]);
  });

  it("recognizes an older folder that describes itself the same way", () => {
    expect(manifestFiles({ files: ["create_final_entities.parquet"] }).complete).toBe(true);
  });

  it("survives a manifest with nothing useful in it", () => {
    expect(manifestFiles({})).toEqual({ files: [], complete: false });
    expect(manifestFiles({ files: "not a list" } as { files?: unknown })).toEqual({ files: [], complete: false });
    expect(manifestFiles({ files: [1, "entities.parquet"] } as { files?: unknown }).files).toEqual(["entities.parquet"]);
  });
});
