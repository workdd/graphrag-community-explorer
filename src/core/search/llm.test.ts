import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, embed, ProviderError, traceableSettings, type Provider } from "./llm";

const provider: Provider = {
  baseUrl: "https://example.test/v1/",
  apiKey: "secret-key",
  chatModel: "chat-1",
  embedModel: "embed-1",
};

const reply = (body: unknown, init: ResponseInit = {}) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200, ...init }));

afterEach(() => vi.unstubAllGlobals());

describe("chat", () => {
  it("returns the message and the reported usage", async () => {
    const fetchMock = reply({
      choices: [{ message: { content: "answer" } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await chat(provider, [{ role: "user", content: "q" }]);
    expect(result.text).toBe("answer");
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 3 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/v1/chat/completions");
  });

  it("reports null usage when the provider sends none", async () => {
    vi.stubGlobal("fetch", reply({ choices: [{ message: { content: "a" } }] }));
    const result = await chat(provider, [{ role: "user", content: "q" }]);
    expect(result.usage).toEqual({ promptTokens: null, completionTokens: null });
  });

  it("calls 401 an auth failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(chat(provider, [])).rejects.toMatchObject({ kind: "auth", status: 401 });
  });

  it("calls 429 a rate failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    await expect(chat(provider, [])).rejects.toMatchObject({ kind: "rate" });
  });

  it("calls 500 a server failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    await expect(chat(provider, [])).rejects.toMatchObject({ kind: "server" });
  });

  it("calls a thrown fetch a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(chat(provider, [])).rejects.toMatchObject({ kind: "network" });
  });

  it("rejects a body with no content", async () => {
    vi.stubGlobal("fetch", reply({ choices: [{}] }));
    await expect(chat(provider, [])).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("embed", () => {
  it("returns one vector per input", async () => {
    vi.stubGlobal("fetch", reply({ data: [{ embedding: [1, 2] }, { embedding: [3, 4] }] }));
    const vectors = await embed(provider, ["a", "b"]);
    expect(vectors).toHaveLength(2);
    expect(Array.from(vectors[0])).toEqual([1, 2]);
  });

  it("rejects a short reply", async () => {
    vi.stubGlobal("fetch", reply({ data: [{ embedding: [1] }] }));
    await expect(embed(provider, ["a", "b"])).rejects.toMatchObject({ kind: "bad" });
  });

  it("rejects an empty vector", async () => {
    vi.stubGlobal("fetch", reply({ data: [{ embedding: [] }] }));
    await expect(embed(provider, ["a"])).rejects.toMatchObject({ kind: "bad" });
  });
});

describe("traceableSettings", () => {
  it("carries the models and the extras but not the credentials", () => {
    const settings = traceableSettings(provider, { topK: 10 });
    expect(settings).toEqual({ chatModel: "chat-1", embedModel: "embed-1", topK: 10 });
    expect(JSON.stringify(settings)).not.toContain("secret-key");
    expect(JSON.stringify(settings)).not.toContain("example.test");
  });
});
