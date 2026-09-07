import { useRef, useState, type DragEvent } from "react";
import type { LoadState } from "../App";
import { Mark } from "../Mark";

interface Props {
  state: LoadState;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  defaultData?: string;
  onDefault: () => void;
}

/** Folder drops arrive as directory entries; walk them so a whole GraphRAG output folder can be dropped. */
async function filesFromDrop(items: DataTransferItemList, fallback: FileList): Promise<File[]> {
  const out: File[] = [];
  const walk = (entry: FileSystemEntry): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file((file) => {
          out.push(file);
          resolve();
        }, () => resolve());
      } else if (entry.isDirectory) {
        (entry as FileSystemDirectoryEntry).createReader().readEntries(async (entries) => {
          for (const child of entries) await walk(child);
          resolve();
        }, () => resolve());
      } else {
        resolve();
      }
    });
  const entries = [...items].map((item) => item.webkitGetAsEntry?.() ?? null).filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) return [...fallback];
  for (const entry of entries) await walk(entry);
  return out;
}

export function LoadScreen({ state, onFiles, onSample, defaultData, onDefault }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActive(false);
    onFiles(await filesFromDrop(event.dataTransfer.items, event.dataTransfer.files));
  };

  return (
    <main className="load">
      <div className="load-inner">
        <Mark size={44} />
        <h1>GraphRAG Community Explorer</h1>
        <p className="lede">
          Read a GraphRAG index the way it is organized: communities first, then the entities and relationships
          inside each one. Files are parsed in this tab and never uploaded.
        </p>

        <div
          className={`dropzone${active ? " active" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setActive(true);
          }}
          onDragLeave={() => setActive(false)}
          onDrop={onDrop}
        >
          <strong>Drop a GraphRAG output folder here</strong>
          <span>or click to choose the Parquet files</span>
          <input
            ref={input}
            type="file"
            multiple
            accept=".parquet"
            hidden
            onChange={(e) => e.target.files && onFiles([...e.target.files])}
          />
        </div>

        {defaultData && (
          <div className="load-actions">
            <button className="btn primary" onClick={onDefault} disabled={state.status === "loading"}>
              Open {defaultData}
            </button>
            <span className="note">Configured in .env.development.local as VITE_DEFAULT_DATA.</span>
          </div>
        )}
        <div className="load-actions">
          <button className={`btn${defaultData ? "" : " primary"}`} onClick={onSample} disabled={state.status === "loading"}>
            Open the sample dataset
          </button>
          <span className="note">A synthetic e-commerce platform with three levels of communities.</span>
        </div>

        {state.status === "loading" && <div className="load-status">Reading {state.label}…</div>}
        {state.status === "error" && <div className="load-status error">{state.message}</div>}

        <table className="files-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>entities.parquet</td><td>Required. Entity titles, types, descriptions.</td></tr>
            <tr><td>relationships.parquet</td><td>Required. Edges between entity titles.</td></tr>
            <tr><td>communities.parquet</td><td>Hierarchy, levels and members. Without it the dataset has no partition.</td></tr>
            <tr><td>community_reports.parquet</td><td>Summaries, findings and ranks shown in the inspector.</td></tr>
            <tr><td>&lt;label&gt;_communities.parquet</td><td>Any extra community set (for example leiden_communities.parquet) becomes a switchable partition.</td></tr>
          </tbody>
        </table>
        <p className="load-foot">
          GraphRAG 0.3 to 2.x file names are recognized, including the create_final_ prefix. Hosted folders open with
          ?data=&lt;url&gt;.
        </p>
      </div>
    </main>
  );
}
