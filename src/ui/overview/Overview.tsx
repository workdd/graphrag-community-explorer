import { useMemo, useState } from "react";
import type { LoadResult } from "../../core/loaders/graphrag";
import { checkIntegrity } from "../../core/metrics/integrity";
import { datasetCounts, summarizePartition } from "../../core/metrics/summary";
import { Mark } from "../Mark";
import { fmt, pct } from "../format";
import { CommunityTable } from "./CommunityTable";
import { HierarchyTree } from "./HierarchyTree";
import { Inspector } from "./Inspector";
import { IntegrityPanel } from "./IntegrityPanel";

interface Props {
  result: LoadResult;
  label: string;
  onReset: () => void;
}

export function Overview({ result, label, onReset }: Props) {
  const { dataset, notes } = result;
  const [partitionId, setPartitionId] = useState(dataset.partitions[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const partition = dataset.partitions.find((p) => p.id === partitionId) ?? dataset.partitions[0];

  const counts = useMemo(() => datasetCounts(dataset), [dataset]);
  const summary = useMemo(() => (partition ? summarizePartition(dataset, partition) : null), [dataset, partition]);
  const integrity = useMemo(() => (partition ? checkIntegrity(dataset, partition) : []), [dataset, partition]);

  const levels = partition?.levels ?? [];
  const selected = selectedId && partition ? partition.communities.get(selectedId) ?? null : null;

  return (
    <div className="app">
      <header className="topbar">
        <Mark size={22} />
        <span className="topbar-title">GraphRAG Community Explorer</span>
        <span className="topbar-dataset" title={dataset.source.files.join(", ")}>
          {label}: {dataset.source.files.join(", ")}
        </span>
        {dataset.partitions.length > 1 && (
          <select
            aria-label="Community set"
            value={partition?.id}
            onChange={(e) => {
              setPartitionId(e.target.value);
              setSelectedId(null);
            }}
          >
            {dataset.partitions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.communities.size})
              </option>
            ))}
          </select>
        )}
        <button className="btn" onClick={onReset}>Open another dataset</button>
      </header>

      <aside className="rail">
        <section className="rail-section">
          <h2>Dataset</h2>
          <dl>
            <dt>Source</dt>
            <dd>{dataset.source.kind === "age-export" ? "Apache AGE export" : "GraphRAG output"}</dd>
            <dt>Entity types</dt>
            <dd>{counts.entityTypes.size}</dd>
            <dt>Relationship types</dt>
            <dd>{counts.relationshipTypes.size}</dd>
          </dl>
        </section>
        {partition ? (
          <HierarchyTree partition={partition} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <section className="rail-section muted">No communities.parquet was loaded, so there is no hierarchy to show.</section>
        )}
      </aside>

      <main className="main">
        <p className="summary">
          <b>{fmt(counts.entities)}</b> entities and <b>{fmt(counts.relationships)}</b> relationships.{" "}
          {partition && summary ? (
            <>
              <b>{fmt(partition.communities.size)}</b> communities on <b>{levels.length}</b> level{levels.length === 1 ? "" : "s"}
              {levels.length > 0 && <> (L{levels[0]}{levels.length > 1 ? `–L${levels[levels.length - 1]}` : ""})</>};{" "}
              <b>{fmt(summary.coveredEntities)}</b> entities ({pct(summary.coverage)}) belong to at least one
              {summary.multiMembership > 0 && (
                <>, <b>{fmt(summary.multiMembership)}</b> to more than one on the same level</>
              )}
              .
            </>
          ) : (
            <>No community set loaded.</>
          )}{" "}
          {counts.isolatedEntities > 0 && (
            <>
              <b>{fmt(counts.isolatedEntities)}</b> entities have no relationships.
            </>
          )}
        </p>

        <IntegrityPanel notes={notes} findings={integrity} />

        {partition && summary && (
          <CommunityTable partition={partition} metrics={summary.metrics} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </main>

      <aside className="inspector">
        <Inspector dataset={dataset} partition={partition ?? null} community={selected} metrics={summary?.metrics} onSelect={setSelectedId} />
      </aside>
    </div>
  );
}
