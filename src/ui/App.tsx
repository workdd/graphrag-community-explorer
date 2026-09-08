import { useCallback, useEffect, useState } from "react";
import type { LoadResult } from "../core/loaders/graphrag";
import { loadFromFiles, loadFromUrl } from "../core/loaders/files";
import { LoadScreen } from "./shell/LoadScreen";
import { Overview } from "./overview/Overview";

export type LoadState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "error"; message: string }
  | { status: "ready"; result: LoadResult; label: string };

// Local default for developers: VITE_DEFAULT_DATA=./data/my-index in .env.development.local (ignored by Git, dev only).
const DEFAULT_DATA = (import.meta.env.VITE_DEFAULT_DATA as string | undefined)?.trim() || undefined;

export function App() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const run = useCallback(async (label: string, task: () => Promise<LoadResult>, dataUrl?: string) => {
    setState({ status: "loading", label });
    try {
      const result = await task();
      // Hosted folders stay in the URL so a reload or a shared link reopens them; chosen files cannot.
      const params = new URLSearchParams(window.location.search);
      if (dataUrl) params.set("data", dataUrl);
      else params.delete("data");
      // Keep the folder path readable in the address bar (./data/age rather than .%2Fdata%2Fage).
      const query = params.toString().replace(/%2F/g, "/").replace(/%3A/g, ":");
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      setState({ status: "ready", result, label });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  // ?data=./data/my-index opens a hosted folder without any clicks; the configured default does the same.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("data") ?? DEFAULT_DATA;
    if (url) void run(url, () => loadFromUrl(url), url);
  }, [run]);

  if (state.status === "ready") {
    // Leaving the dataset also leaves the URL, so a reload shows the load screen instead of reopening it.
    return <Overview result={state.result} label={state.label} onReset={() => { window.history.replaceState(null, "", window.location.pathname); setState({ status: "idle" }); }} />;
  }
  return (
    <LoadScreen
      state={state}
      onFiles={(files) => run(`${files.length} files`, () => loadFromFiles(files))}
      onSample={() => run("Sample dataset", () => loadFromUrl(`${import.meta.env.BASE_URL}samples/demo`), `${import.meta.env.BASE_URL}samples/demo`)}
      defaultData={DEFAULT_DATA}
      onDefault={() => DEFAULT_DATA && run(DEFAULT_DATA, () => loadFromUrl(DEFAULT_DATA), DEFAULT_DATA)}
    />
  );
}
