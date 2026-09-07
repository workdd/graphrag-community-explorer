import { pathTo } from "../../core/hierarchy";
import type { CommunityMetrics } from "../../core/metrics/summary";
import type { Community, Dataset, Partition } from "../../core/model";
import { fmt, pct } from "../format";

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  community: Community | null;
  metrics?: Map<string, CommunityMetrics>;
  onSelect: (id: string) => void;
}

const MEMBER_PREVIEW = 24;

export function Inspector({ dataset, partition, community, metrics, onSelect }: Props) {
  if (!partition || !community) {
    return <div className="inspector-empty"><p>Select a community to read its report and members.</p></div>;
  }
  const path = pathTo(partition, community.id);
  const m = metrics?.get(community.id);
  const members = community.entityIds.map((id) => dataset.entities.get(id)).filter((e) => e !== undefined);
  const children = community.childIds.map((id) => partition.communities.get(id)).filter((c) => c !== undefined);
  const report = community.report;

  return (
    <div className="inspector-body">
      {path.length > 1 && (
        <nav className="crumbs" aria-label="Parent communities">
          {path.slice(0, -1).map((p) => (
            <button key={p.id} className="crumb" onClick={() => onSelect(p.id)}>{p.title}</button>
          ))}
        </nav>
      )}
      <h2>{community.title}</h2>
      <p className="facts">
        Level {community.level}. {fmt(members.length)} entities
        {m && (
          <>, {fmt(m.internalEdges)} internal relationships{m.internalEdges + m.boundaryEdges > 0 && <> ({pct(m.internalRatio)} of its edges)</>}</>
        )}
        .{community.membershipSource === "relationship_ids" && " Members were inferred from relationship endpoints."}
      </p>

      <div className="report">
        <h3>Summary</h3>
        {report && report.summary ? <p>{report.summary}</p> : <p className="muted">No report for this community.</p>}
        {report && report.findings.length > 0 && (
          <>
            <h3>Findings</h3>
            <ol className="findings">
              {report.findings.map((f, i) => (
                <li key={i}>
                  <strong>{f.summary}</strong>
                  {f.explanation && <p>{f.explanation}</p>}
                </li>
              ))}
            </ol>
          </>
        )}
        {report?.rank !== undefined && (
          <p className="muted">Rank {report.rank}{report.rankExplanation ? `. ${report.rankExplanation}` : ""}</p>
        )}
      </div>

      {children.length > 0 && (
        <>
          <h3>Child communities</h3>
          <ul className="chips">
            {children.map((c) => (
              <li key={c.id}><button className="chip" onClick={() => onSelect(c.id)}>{c.title} ({fmt(c.entityIds.length)})</button></li>
            ))}
          </ul>
        </>
      )}

      <h3>Entities</h3>
      <ul className="members">
        {members.slice(0, MEMBER_PREVIEW).map((e) => (
          <li key={e.id}>
            <span className="type" title={e.type}>{e.type}</span>
            <span className="name" title={e.title}>{e.title}</span>
          </li>
        ))}
      </ul>
      {members.length > MEMBER_PREVIEW && (
        <p className="muted">{fmt(members.length - MEMBER_PREVIEW)} more. The full list comes with the internal graph view.</p>
      )}
      <button className="btn primary" disabled title="Arrives with the next milestone">Open internal graph</button>
    </div>
  );
}
