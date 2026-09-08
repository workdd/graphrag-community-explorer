// Where the provider settings live. The key is the caller's own, it stays in this browser, and it
// is never written into a trace or a log line.
import type { Provider } from "../../core/search/llm";

export const STORAGE_KEY = "graphrag-explorer.provider";

export interface Preset {
  id: string;
  label: string;
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  /** Said out loud because getting these two backwards silently ruins every ranking. */
  note?: string;
}

export const PRESETS: Preset[] = [
  {
    id: "upstage",
    label: "Upstage",
    baseUrl: "https://api.upstage.ai/v1",
    chatModel: "solar-pro2",
    embedModel: "solar-embedding-1-large-query",
    note: "Upstage splits its embedding model in two. Build the file with …-passage and ask with …-query.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
    embedModel: "text-embedding-3-small",
  },
];

export const emptyProvider = (): Provider => ({
  baseUrl: PRESETS[0].baseUrl,
  apiKey: "",
  chatModel: PRESETS[0].chatModel,
  embedModel: PRESETS[0].embedModel,
});

const text = (v: unknown, fallback: string): string => (typeof v === "string" && v.trim() !== "" ? v.trim() : fallback);

export function readProvider(store: Pick<Storage, "getItem"> | null): Provider {
  const blank = emptyProvider();
  if (!store) return blank;
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return blank; // a browser told to block site data throws on the accessor itself
  }
  if (!raw) return blank;
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    return {
      baseUrl: text(saved.baseUrl, blank.baseUrl),
      apiKey: text(saved.apiKey, ""),
      chatModel: text(saved.chatModel, blank.chatModel),
      embedModel: text(saved.embedModel, blank.embedModel),
    };
  } catch {
    return blank;
  }
}

export function writeProvider(store: Pick<Storage, "setItem"> | null, provider: Provider): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(provider));
  } catch {
    // Nothing to do: the settings simply do not survive this reload.
  }
}

export function clearProvider(store: Pick<Storage, "removeItem"> | null): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // as above
  }
}

export const isConfigured = (provider: Provider): boolean =>
  provider.apiKey.trim() !== "" && provider.baseUrl.trim() !== "" && provider.chatModel.trim() !== "";

/** Enough of the key to recognize it, never enough to use it. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") return "";
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 3)}${"•".repeat(Math.min(12, trimmed.length - 6))}${trimmed.slice(-3)}`;
}
