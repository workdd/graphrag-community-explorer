import { describe, expect, it } from "vitest";
import { chooseColumns, EDGE_COLUMNS, NODE_COLUMNS, parseCsv, pickColumn, readEdgeCsv, readNodeCsv, UNTYPED, UNTYPED_EDGE } from "./csv";

describe("splitting CSV text", () => {
  it("reads a plain table", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("keeps a comma inside quotes in one field", () => {
    expect(parseCsv('a,b\n"one, two",3')).toEqual([["a", "b"], ["one, two", "3"]]);
  });

  it("keeps a newline inside quotes in one field", () => {
    expect(parseCsv('a,b\n"line\nbreak",3')).toEqual([["a", "b"], ["line\nbreak", "3"]]);
  });

  it("reads a doubled quote as one quote", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("survives carriage returns and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("survives a spreadsheet byte-order mark", () => {
    expect(parseCsv("﻿id,name\n1,x")[0]).toEqual(["id", "name"]);
  });

  it("ends a file whose quote is never closed rather than throwing", () => {
    // A truncated export should still show what it has.
    expect(parseCsv('a,b\n"never closed')).toEqual([["a", "b"], ["never closed"]]);
  });

  it("has nothing to say about nothing", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n")).toEqual([]);
  });
});

describe("guessing which column is which", () => {
  it("ignores case, spaces, underscores and hyphens", () => {
    expect(pickColumn(["Node ID", "x"], ["nodeid"])).toBe(0);
    expect(pickColumn(["node_id"], ["nodeid"])).toBe(0);
    expect(pickColumn(["NODE-ID"], ["nodeid"])).toBe(0);
  });

  it("prefers the earlier name in the list, not the earlier column", () => {
    // "id" is a better guess than "name", wherever they sit.
    expect(pickColumn(["name", "id"], NODE_COLUMNS.id)).toBe(1);
  });

  it("says so when there is no match", () => {
    expect(pickColumn(["alpha", "beta"], ["id"])).toBe(-1);
  });

  it("reports the header it matched, so a wrong guess is visible", () => {
    const chosen = chooseColumns(["From", "To", "Kind"], EDGE_COLUMNS);
    expect(chosen.named).toMatchObject({ source: "From", target: "To", type: "Kind" });
  });
});

describe("reading a node table", () => {
  it("takes id, title, type and description under any of their usual names", () => {
    const read = readNodeCsv("Node,Label,Category,Summary\nn1,Alpha,Service,does things");
    expect(read.rows[0]).toEqual({ id: "n1", title: "Alpha", type: "Service", description: "does things" });
  });

  it("falls back to the first column when nothing looks like an id", () => {
    const read = readNodeCsv("alpha,beta\nn1,x");
    expect(read.rows[0].id).toBe("n1");
  });

  it("uses the id as the title when the file has no name for it", () => {
    expect(readNodeCsv("id\nn1").rows[0].title).toBe("n1");
  });

  it("gives an untyped file one type, because one type is still a schema", () => {
    expect(readNodeCsv("id\nn1").rows[0].type).toBe(UNTYPED);
  });

  it("drops a row with no id and says how many", () => {
    const read = readNodeCsv("id,name\nn1,a\n,b\n  ,c");
    expect(read.rows).toHaveLength(1);
    expect(read.skipped).toBe(2);
  });
});

describe("reading an edge table", () => {
  it("takes the ends under any of their usual names", () => {
    const read = readEdgeCsv("From,To,Relation,Weight\na,b,calls,3");
    expect(read.rows[0]).toEqual({ source: "a", target: "b", type: "calls", weight: 3 });
  });

  it("reads a bare edge list as its first two columns", () => {
    const read = readEdgeCsv("alpha,beta\na,b\nb,c");
    expect(read.rows.map((r) => [r.source, r.target])).toEqual([["a", "b"], ["b", "c"]]);
  });

  it("gives an unlabelled edge one type", () => {
    expect(readEdgeCsv("source,target\na,b").rows[0].type).toBe(UNTYPED_EDGE);
  });

  it("leaves the weight out rather than inventing one", () => {
    expect(readEdgeCsv("source,target\na,b").rows[0].weight).toBeUndefined();
    expect(readEdgeCsv("source,target,weight\na,b,not a number").rows[0].weight).toBeUndefined();
  });

  it("drops an edge missing an end and says how many", () => {
    const read = readEdgeCsv("source,target\na,b\na,\n,b");
    expect(read.rows).toHaveLength(1);
    expect(read.skipped).toBe(2);
  });
});
