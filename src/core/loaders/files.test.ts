import { describe, expect, it } from "vitest";
import { classifyFile } from "./files";

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
