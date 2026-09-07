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

export function App() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const run = useCallback(async (label: string, task: () => Promise<LoadResult>) => {
    setState({ status: "loading", label });
    try {
      const result = await task();
      setState({ status: "ready", result, label });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  // ?data=./data/my-index opens a hosted folder without any clicks (used for demos and local exports).
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("data");
    if (url) void run(url, () => loadFromUrl(url));
  }, [run]);

  if (state.status === "ready") {
    return <Overview result={state.result} label={state.label} onReset={() => setState({ status: "idle" })} />;
  }
  return (
    <LoadScreen
      state={state}
      onFiles={(files) => run(`${files.length} files`, () => loadFromFiles(files))}
      onSample={() => run("Sample dataset", () => loadFromUrl(`${import.meta.env.BASE_URL}samples/demo`))}
    />
  );
}
