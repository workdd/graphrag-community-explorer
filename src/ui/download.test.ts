import { describe, expect, it } from "vitest";
import { safeName, toCsv } from "./download";

describe("download helpers", () => {
  it("quotes csv fields that need it", () => {
    expect(toCsv([["a", 1, null], ['x,y', 'say "hi"', "line\nbreak"]])).toBe('a,1,\r\n"x,y","say ""hi""","line\nbreak"\r\n');
  });
  it("makes file names safe but keeps unicode letters", () => {
    expect(safeName("스냅샷 관리 (212) / QA")).toBe("스냅샷-관리-212-QA");
    expect(safeName("///")).toBe("export");
  });
});
