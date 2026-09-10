import { useRef, useState, type DragEvent } from "react";
import type { LoadState } from "../App";
import type { DatasetRef } from "../../core/loaders/files";
import { Mark } from "../Mark";
import { LangToggle, useT } from "../i18n";

interface Props {
  state: LoadState;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  defaultData?: string;
  onDefault: () => void;
  datasets: DatasetRef[];
  onOpenDataset: (path: string) => void;
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

export function LoadScreen({ state, onFiles, onSample, defaultData, onDefault, datasets, onOpenDataset }: Props) {
  const { t } = useT();
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
        <div className="load-top"><Mark size={44} /><LangToggle /></div>
        <h1>GraphRAG Inspector</h1>
        <p className="lede">{t("Read a GraphRAG index the way it is organized: communities first, then the entities and relationships inside each one. Files are parsed in this tab and never uploaded.")}</p>
        <p className="lede-note">{t("The Ask tab is the exception: a question sends the evidence it selected to the model provider you configure.")}</p>

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
          <strong>{t("Drop a GraphRAG output folder here")}</strong>
          <span>{t("or click to choose the Parquet files")}</span>
          <input
            ref={input}
            type="file"
            multiple
            accept=".parquet"
            hidden
            onChange={(e) => e.target.files && onFiles([...e.target.files])}
          />
        </div>

        {datasets.length > 0 ? (
          <div className="load-actions">
            {datasets.map((entry, index) => (
              <button key={entry.path} className={`btn${index === 0 ? " primary" : ""}`} onClick={() => onOpenDataset(entry.path)} disabled={state.status === "loading"}>
                {t("Open {path}", { path: entry.label })}
              </button>
            ))}
            <span className="note">{t("Folders this server was started with. They stay on this machine.")}</span>
          </div>
        ) : defaultData ? (
          <div className="load-actions">
            <button className="btn primary" onClick={onDefault} disabled={state.status === "loading"}>
              {t("Open {path}", { path: defaultData })}
            </button>
            <span className="note">{t("Configured in .env.development.local as VITE_DEFAULT_DATA.")}</span>
          </div>
        ) : null}
        <div className="load-actions">
          <button className={`btn${defaultData || datasets.length > 0 ? "" : " primary"}`} onClick={onSample} disabled={state.status === "loading"}>
            {t("Open the sample dataset")}
          </button>
          <span className="note">{t("A synthetic e-commerce platform with three levels of communities.")}</span>
        </div>

        {window.location.hash.length > 1 && state.status !== "loading" && (
          <div className="load-status">{t("This link carries a view state; it is restored once the same files are chosen again. Links share the view, never the data.")}</div>
        )}
        {state.status === "loading" && <div className="load-status">{t("Reading {label}…", { label: state.label })}</div>}
        {state.status === "error" && <div className="load-status error">{state.message}</div>}

        <table className="files-table">
          <thead>
            <tr>
              <th>{t("File")}</th>
              <th>{t("Used for")}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>entities.parquet</td><td>{t("Required. Entity titles, types, descriptions.")}</td></tr>
            <tr><td>relationships.parquet</td><td>{t("Required. Edges between entity titles.")}</td></tr>
            <tr><td>communities.parquet</td><td>{t("Recommended. Hierarchy, levels and members; without it only the entity list and neighbourhood graphs are available.")}</td></tr>
            <tr><td>community_reports.parquet</td><td>{t("Summaries, findings and ranks shown in the inspector.")}</td></tr>
            <tr><td>embeddings.parquet</td><td>{t("Optional sidecar of entity vectors. Local search in the Ask tab needs it; the embed_index tool writes one.")}</td></tr>
            <tr><td>&lt;label&gt;_communities.parquet</td><td>{t("Any extra community set (for example leiden_communities.parquet) becomes a switchable partition.")}</td></tr>
          </tbody>
        </table>
        <p className="load-foot">{t("GraphRAG 0.3 to 2.x file names are recognized, including the create_final_ prefix. Hosted folders open with ?data=<url>.")}</p>
      </div>
    </main>
  );
}
