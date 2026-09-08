// One OpenAI-compatible provider, called straight from the tab. The key stays in the caller's hands
// and never reaches a log line or a trace file.

export interface Provider {
  /** Without a trailing slash, for example https://api.upstage.ai/v1 */
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel: string;
}

export type FailureKind = "auth" | "rate" | "server" | "network" | "bad";

export class ProviderError extends Error {
  readonly kind: FailureKind;
  readonly status?: number;
  constructor(kind: FailureKind, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
  }
}

export interface Usage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface ChatResult {
  text: string;
  usage: Usage;
}

export interface Message {
  role: "system" | "user";
  content: string;
}

const NO_USAGE: Usage = { promptTokens: null, completionTokens: null };

const url = (provider: Provider, path: string) => `${provider.baseUrl.replace(/\/+$/, "")}${path}`;

const headers = (provider: Provider) => ({
  "content-type": "application/json",
  authorization: `Bearer ${provider.apiKey}`,
});

function classify(status: number): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  return "bad";
}

async function post(provider: Provider, path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url(provider, path), {
      method: "POST",
      headers: headers(provider),
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // A blocked cross-origin call and a dropped connection both land here with no status.
    throw new ProviderError("network", error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(classify(response.status), detail || response.statusText, response.status);
  }
  return response.json();
}

const usageOf = (raw: unknown): Usage => {
  const u = (raw as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return u ? { promptTokens: n(u.prompt_tokens), completionTokens: n(u.completion_tokens) } : NO_USAGE;
};

export async function chat(
  provider: Provider,
  messages: Message[],
  opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<ChatResult> {
  const json = await post(
    provider,
    "/chat/completions",
    {
      model: provider.chatModel,
      messages,
      temperature: opts.temperature ?? 0,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    },
    opts.signal,
  );
  const text = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new ProviderError("bad", "The provider returned no message content.");
  return { text, usage: usageOf(json) };
}

export async function embed(
  provider: Provider,
  input: string[],
  opts: { signal?: AbortSignal } = {},
): Promise<Float32Array[]> {
  const json = await post(provider, "/embeddings", { model: provider.embedModel, input }, opts.signal);
  const data = (json as { data?: { embedding?: unknown }[] })?.data;
  if (!Array.isArray(data) || data.length !== input.length) {
    throw new ProviderError("bad", `Expected ${input.length} embeddings, got ${Array.isArray(data) ? data.length : 0}.`);
  }
  return data.map((row) => {
    const v = row?.embedding;
    if (!Array.isArray(v) || v.length === 0) throw new ProviderError("bad", "The provider returned an empty embedding.");
    return Float32Array.from(v as number[]);
  });
}

/** Settings that may be written into a trace. The key and the base URL are deliberately absent. */
export const traceableSettings = (provider: Provider, extra: Record<string, string | number | boolean>) => ({
  chatModel: provider.chatModel,
  embedModel: provider.embedModel,
  ...extra,
});
