import { useMemo } from "react";
import { displayTitle } from "../../core/graph/palette";
import { relationshipsOf } from "../../core/graph/subgraph";
import { membershipIndex, pathTo } from "../../core/hierarchy";
import type { CommunityMetrics } from "../../core/metrics/summary";
import type { Community, Dataset, Entity, Partition } from "../../core/model";
import type { GraphFocus } from "../graph/CommunityGraph";
import { fmt, pct } from "../format";

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  community: Community | null;
  metrics?: Map<string, CommunityMetrics>;
  focus: GraphFocus;
  onFocus: (focus: GraphFocus) => void;
  onSelect: (id: string) => void;
  onOpenGraph: () => void;
  inGraph: boolean;
  graphIds: string[];
  onAddCommunity: (id: string) => void;
  inMap: boolean;
  mapOpen: boolean;
  onToggleMap: () => void;
}

const MEMBER_PREVIEW = 24;
const RELATIONSHIP_PREVIEW = 80;

export function Inspector(props: Props) {
  const { partition, community, focus } = props;
  if (!partition) return <div className="inspector-empty"><p>No community set is loaded.</p></div>;
  if (focus?.kind === "entity") return <EntityPanel {...props} entityId={focus.id} />;
  if (focus?.kind === "relationship") return <RelationshipPanel {...props} relationshipId={focus.id} />;
  if (!community) return <div className="inspector-empty"><p>Select a community to read its report and members.</p></div>;
  return <CommunityPanel {...props} partition={partition} community={community} />;
}

function CommunityPanel({ dataset, partition, community, metrics, onFocus, onSelect, onOpenGraph, inGraph, inMap, mapOpen, onToggleMap }: Props & { partition: Partition; community: Community }) {
  const path = pathTo(partition, community.id);
  const m = metrics?.get(community.id);
  const members = community.entityIds.map((id) => dataset.entities.get(id)).filter((e): e is Entity => e !== undefined);
  const children = community.childIds.map((id) => partition.communities.get(id)).filter((c): c is Community => c !== undefined);
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
      {inGraph ? (
        <p className="muted">Shown in the graph. Click a node for its neighbours.</p>
      ) : inMap ? (
        <div className="stack">
          <button className="btn primary" onClick={onToggleMap}>{mapOpen ? "Close in map" : "Open in map"}</button>
          <button className="btn" onClick={onOpenGraph}>Open internal graph</button>
        </div>
      ) : (
        <button className="btn primary" onClick={onOpenGraph}>Open internal graph</button>
      )}

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
            <button className="member-btn" onClick={() => onFocus({ kind: "entity", id: e.id })} title={e.title}>
              <span className="type">{e.type}</span>
              <span className="name">{displayTitle(e)}</span>
            </button>
          </li>
        ))}
      </ul>
      {members.length > MEMBER_PREVIEW && (
        <p className="muted">{fmt(members.length - MEMBER_PREVIEW)} more. Use the graph's search to find one.</p>
      )}
    </div>
  );
}

function EntityPanel({ dataset, partition, community, onFocus, onSelect, inGraph, graphIds, onAddCommunity, entityId }: Props & { entityId: string }) {
  const index = useMemo(() => (partition ? membershipIndex(partition) : new Map<string, Community[]>()), [partition]);
  const entity = dataset.entities.get(entityId);
  const relationships = useMemo(() => {
    const list = relationshipsOf(dataset, entityId);
    return list.sort((a, b) => Number(b.sourceId === entityId) - Number(a.sourceId === entityId) || a.type.localeCompare(b.type));
  }, [dataset, entityId]);
  if (!entity) return <div className="inspector-empty"><p>This entity is not in the loaded dataset.</p></div>;
  const memberships = [...(index.get(entity.id) ?? [])].sort((a, b) => a.size - b.size);
  const short = displayTitle(entity);

  return (
    <div className="inspector-body">
      <nav className="crumbs">
        <button className="crumb" onClick={() => onFocus(null)}>{community ? community.title : "Back"}</button>
      </nav>
      <h2>{short}</h2>
      <p className="facts">
        {entity.type}. {fmt(relationships.length)} relationships.
        {short !== entity.title && <> Full title: {entity.title}.</>}
      </p>
      <Description text={entity.description} />

      <h3>Communities</h3>
      {memberships.length === 0 ? (
        <p className="muted">Belongs to no community.</p>
      ) : (
        <ul className="chips">
          {memberships.map((c) => (
            <li key={c.id} className="stack">
              <button className="chip" onClick={() => onSelect(c.id)} title="Select this community">L{c.level} {c.title} ({fmt(c.entityIds.length)})</button>
              {inGraph && !graphIds.includes(c.id) && (
                <button className="chip" onClick={() => onAddCommunity(c.id)} title="Draw this community in the same graph">+ add to graph</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Relationships</h3>
      <ul className="rel-list">
        {relationships.slice(0, RELATIONSHIP_PREVIEW).map((r) => {
          const outgoing = r.sourceId === entity.id;
          const other = dataset.entities.get(outgoing ? r.targetId : r.sourceId);
          return (
            <li key={r.id} className={outgoing ? "out" : "in"}>
              <span className="dir" aria-label={outgoing ? "outgoing" : "incoming"}>{outgoing ? "→" : "←"}</span>
              <button className="who" title={other?.title} onClick={() => other && onFocus({ kind: "entity", id: other.id })}>
                {other ? displayTitle(other) : "?"}
              </button>
              <button className="kind" title={r.description ?? r.type} onClick={() => onFocus({ kind: "relationship", id: r.id })}>{r.type}</button>
            </li>
          );
        })}
      </ul>
      {relationships.length > RELATIONSHIP_PREVIEW && <p className="muted">{fmt(relationships.length - RELATIONSHIP_PREVIEW)} more.</p>}
    </div>
  );
}

/** Exports often stash the source record as JSON in the description; show it as fields instead of one long line. */
function Description({ text }: { text?: string }) {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const record = JSON.parse(trimmed) as Record<string, unknown>;
      const entries = Object.entries(record).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");
      if (entries.length > 0) {
        return (
          <dl className="props">
            {entries.map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        );
      }
    } catch {
      // not JSON after all; fall through to plain text
    }
  }
  return <p className="desc">{text}</p>;
}

function RelationshipPanel({ dataset, community, onFocus, relationshipId }: Props & { relationshipId: string }) {
  const relationship = dataset.relationships.find((r) => r.id === relationshipId);
  if (!relationship) return <div className="inspector-empty"><p>This relationship is not in the loaded dataset.</p></div>;
  const source = dataset.entities.get(relationship.sourceId);
  const target = dataset.entities.get(relationship.targetId);
  return (
    <div className="inspector-body">
      <nav className="crumbs">
        <button className="crumb" onClick={() => onFocus(null)}>{community ? community.title : "Back"}</button>
      </nav>
      <h2>{source ? displayTitle(source) : "?"} → {target ? displayTitle(target) : "?"}</h2>
      <p className="facts">
        {relationship.type}
        {relationship.weight !== undefined && <>, weight {relationship.weight}</>}.
      </p>
      {relationship.description && <p className="desc">{relationship.description}</p>}
      <div className="stack">
        {source && <button className="chip" onClick={() => onFocus({ kind: "entity", id: source.id })}>Source: {displayTitle(source)}</button>}
        {target && <button className="chip" onClick={() => onFocus({ kind: "entity", id: target.id })}>Target: {displayTitle(target)}</button>}
      </div>
    </div>
  );
}
