import { afterEach, describe, expect, it, vi } from "vitest";
import { clearProvider, emptyProvider, fromEnvironment, isConfigured, maskKey, readProvider, STORAGE_KEY, writeProvider , PRESETS } from "./provider";

const store = (value: string | null) => ({
  getItem: vi.fn(() => value),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

describe("fromEnvironment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the first preset when nothing is set", () => {
    const { provider, fromEnv } = fromEnvironment();
    expect(provider.apiKey).toBe("");
    expect(provider.baseUrl).toBe(PRESETS[0].baseUrl);
    expect(fromEnv).toEqual([]);
  });

  it("takes every field the environment supplies", () => {
    vi.stubEnv("VITE_LLM_BASE_URL", "https://env.test/v1");
    vi.stubEnv("VITE_LLM_API_KEY", "sk-from-env");
    vi.stubEnv("VITE_LLM_CHAT_MODEL", "chat-env");
    vi.stubEnv("VITE_LLM_EMBED_MODEL", "embed-env");
    const { provider, fromEnv } = fromEnvironment();
    expect(provider).toEqual({
      baseUrl: "https://env.test/v1", apiKey: "sk-from-env", chatModel: "chat-env", embedModel: "embed-env",
    });
    expect(fromEnv.sort()).toEqual(["apiKey", "baseUrl", "chatModel", "embedModel"]);
  });

  it("ignores a blank variable", () => {
    vi.stubEnv("VITE_LLM_API_KEY", "   ");
    const { provider, fromEnv } = fromEnvironment();
    expect(provider.apiKey).toBe("");
    expect(fromEnv).toEqual([]);
  });

  it("makes a preconfigured provider ready without anyone typing", () => {
    vi.stubEnv("VITE_LLM_API_KEY", "sk-from-env");
    expect(isConfigured(readProvider(store(null)))).toBe(true);
  });
});

describe("readProvider", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers what was typed in this browser over the environment", () => {
    vi.stubEnv("VITE_LLM_API_KEY", "sk-from-env");
    const saved = JSON.stringify({ apiKey: "sk-typed-here" });
    expect(readProvider(store(saved)).apiKey).toBe("sk-typed-here");
  });

  it("falls back to the environment for fields the browser has not set", () => {
    vi.stubEnv("VITE_LLM_CHAT_MODEL", "chat-env");
    expect(readProvider(store(JSON.stringify({ apiKey: "k" }))).chatModel).toBe("chat-env");
  });

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
