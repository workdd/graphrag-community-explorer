import { describe, expect, it, vi } from "vitest";
import { clearProvider, emptyProvider, isConfigured, maskKey, readProvider, STORAGE_KEY, writeProvider } from "./provider";

const store = (value: string | null) => ({
  getItem: vi.fn(() => value),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

describe("readProvider", () => {
  it("falls back to the first preset with no key", () => {
    expect(readProvider(store(null))).toEqual(emptyProvider());
    expect(readProvider(null).apiKey).toBe("");
  });

  it("reads what was saved", () => {
    const saved = JSON.stringify({ baseUrl: "https://x/v1", apiKey: "k", chatModel: "c", embedModel: "e" });
    expect(readProvider(store(saved))).toEqual({ baseUrl: "https://x/v1", apiKey: "k", chatModel: "c", embedModel: "e" });
  });

  it("keeps the defaults for fields the saved value is missing", () => {
    const provider = readProvider(store(JSON.stringify({ apiKey: "k" })));
    expect(provider.apiKey).toBe("k");
    expect(provider.chatModel).toBe(emptyProvider().chatModel);
  });

  it("survives a damaged value", () => {
    expect(readProvider(store("{oops"))).toEqual(emptyProvider());
  });

  it("survives a browser that throws on the accessor", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); } };
    expect(readProvider(throwing)).toEqual(emptyProvider());
  });
});

describe("writeProvider and clearProvider", () => {
  it("writes under one key", () => {
    const s = store(null);
    writeProvider(s, { ...emptyProvider(), apiKey: "k" });
    expect(s.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining("\"apiKey\":\"k\""));
  });

  it("removes the same key", () => {
    const s = store(null);
    clearProvider(s);
    expect(s.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("does not throw when storage refuses", () => {
    expect(() => writeProvider({ setItem: () => { throw new Error("full"); } }, emptyProvider())).not.toThrow();
    expect(() => clearProvider({ removeItem: () => { throw new Error("no"); } })).not.toThrow();
  });
});

describe("isConfigured", () => {
  it("needs a key", () => {
    expect(isConfigured(emptyProvider())).toBe(false);
    expect(isConfigured({ ...emptyProvider(), apiKey: "  " })).toBe(false);
    expect(isConfigured({ ...emptyProvider(), apiKey: "k" })).toBe(true);
  });

  it("needs a base URL and a chat model", () => {
    expect(isConfigured({ ...emptyProvider(), apiKey: "k", baseUrl: "" })).toBe(false);
    expect(isConfigured({ ...emptyProvider(), apiKey: "k", chatModel: "" })).toBe(false);
  });
});

describe("maskKey", () => {
  it("shows nothing for no key", () => {
    expect(maskKey("  ")).toBe("");
  });

  it("hides a short key completely", () => {
    expect(maskKey("abcd")).toBe("••••");
  });

  it("keeps only the ends of a long key", () => {
    const masked = maskKey("sk-abcdefghijklmnop");
    expect(masked.startsWith("sk-")).toBe(true);
    expect(masked.endsWith("nop")).toBe(true);
    expect(masked).not.toContain("defghij");
  });
});
