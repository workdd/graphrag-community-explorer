import { describe, expect, it } from "vitest";
import { evidenceForCommunity, evidenceForEntity, evidenceForRelationship, snippet } from "./evidence";
import type { Community, Dataset } from "./model";

const dataset: Dataset = {
  source: { kind: "graphrag", files: [] },
  entities: new Map([
    ["a", { id: "a", title: "A", type: "T", degree: 1, textUnitIds: ["u1"] }],
    ["b", { id: "b", title: "B", type: "T", degree: 1, textUnitIds: [] }],
  ]),
  relationships: [{ id: "r", sourceId: "a", targetId: "b", type: "calls", textUnitIds: ["u2"] }],
  partitions: [],
  textUnits: new Map([
    ["u1", { id: "u1", text: "A calls B. Then more.", documentIds: ["d1"], entityIds: ["a", "b"], relationshipIds: [] }],
    ["u2", { id: "u2", text: "B is called by A.", documentIds: ["d1"], entityIds: ["b"], relationshipIds: ["r"] }],
    ["u3", { id: "u3", text: "Unrelated.", documentIds: ["missing"], entityIds: [], relationshipIds: [] }],
  ]),
  documents: new Map([["d1", { id: "d1", title: "Doc one" }]]),
  covariates: [],
};
const community: Community = { id: "c", level: 0, parentId: null, childIds: [], title: "C", entityIds: ["a", "b"], relationshipIds: [], size: 2, membershipSource: "entity_ids", textUnitIds: [] };

describe("evidence", () => {
  it("collects entity evidence from its own ids and from units listing it, once each", () => {
    expect(evidenceForEntity(dataset, "a").map((e) => e.unit.id)).toEqual(["u1"]);
    expect(evidenceForEntity(dataset, "b").map((e) => e.unit.id)).toEqual(["u1", "u2"]);
    expect(evidenceForEntity(dataset, "a")[0].documentTitles).toEqual(["Doc one"]);
  });

  it("collects relationship evidence and falls back to document ids without titles", () => {
    expect(evidenceForRelationship(dataset, "r").map((e) => e.unit.id)).toEqual(["u2"]);
    expect(evidenceForEntity(dataset, "zzz")).toEqual([]);
  });

  it("ranks member-mentioning units for communities that ship no text_unit_ids", () => {
    expect(evidenceForCommunity(dataset, community).map((e) => `${e.unit.id}`)).toEqual(["u1", "u2"]);
    expect(evidenceForCommunity(dataset, { ...community, textUnitIds: ["u3"] }).map((e) => e.unit.id)).toEqual(["u3"]);
  });

  it("cuts snippets at a sentence boundary when one is near", () => {
    expect(snippet("Short text.")).toBe("Short text.");
    const long = "First sentence is here. Second sentence goes on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on.";
    expect(snippet(long, 120).endsWith(" …")).toBe(true);
    expect(snippet(long, 60)).toBe("First sentence is here. …");
  });
});
