import { describe, expect, it } from "vitest";
import { readableLink, readableTitle } from "./label";

describe("readableTitle", () => {
  it("drops the source id the runner appended", () => {
    expect(readableTitle("VirtualMachine · web-01 [AGE:1234]")).toBe("web-01");
  });

  it("drops the type prefix", () => {
    expect(readableTitle("BlockStorage · vol-1")).toBe("vol-1");
  });

  it("leaves a plain title alone", () => {
    expect(readableTitle("Checkout")).toBe("Checkout");
  });

  it("keeps a Korean name", () => {
    expect(readableTitle("VirtualMachine · 결제-에이전트-리눅스 [AGE:1]")).toBe("결제-에이전트-리눅스");
  });

  it("does not mistake a middle dot inside a name for a prefix", () => {
    expect(readableTitle("서비스 · 요청")).toBe("서비스 · 요청");
  });

  it("returns something when the title is only an id", () => {
    expect(readableTitle("[AGE:1]")).toBe("[AGE:1]");
  });

  it("survives an empty title", () => {
    expect(readableTitle("")).toBe("");
  });
});

describe("readableLink", () => {
  it("cleans both ends of a link", () => {
    expect(readableLink("VirtualMachine · a [AGE:1] → BlockStorage · b [AGE:2]")).toBe("a → b");
  });

  it("leaves a title that is not a pair alone", () => {
    expect(readableLink("VirtualMachine · a [AGE:1]")).toBe("a");
  });
});
