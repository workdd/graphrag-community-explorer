import { useMemo, useState } from "react";
import { claimsForEntity, evidenceForCommunity, evidenceForEntity, evidenceForRelationship, snippet, type Evidence } from "../../core/evidence";
import { displayTitle } from "../../core/graph/palette";
import { relationshipsOf } from "../../core/graph/subgraph";
import { depthOfLevel, membershipIndex, pathTo } from "../../core/hierarchy";
import { levelLabel } from "../level";
import type { CommunityMetrics } from "../../core/metrics/summary";
import type { Community, Dataset, Entity, Partition } from "../../core/model";
import type { GraphFocus } from "../graph/CommunityGraph";
import { fmt, pct } from "../format";
import { useT } from "../i18n";

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
  onExplore: (entityId: string) => void;
  inMap: boolean;
  mapOpen: boolean;
  onToggleMap: () => void;
}

const MEMBER_PREVIEW = 24;
const RELATIONSHIP_PREVIEW = 80;

export function Inspector(props: Props) {
  const { t } = useT();
  const { partition, community, focus } = props;
  if (focus?.kind === "entity") return <EntityPanel {...props} entityId={focus.id} />;
  if (focus?.kind === "relationship") return <RelationshipPanel {...props} relationshipId={focus.id} />;
  if (focus?.kind === "bundle") return <BundlePanel {...props} bundle={focus} />;
  if (!partition) return <div className="inspector-empty"><p>{t("No community set is loaded. Pick an entity on the left to read it and explore its neighbourhood.")}</p></div>;
  if (!community) return <div className="inspector-empty"><p>{t("Select a community to read its report and members.")}</p></div>;
  return <CommunityPanel {...props} partition={partition} community={community} />;
}

function CommunityPanel({ dataset, partition, community, metrics, onFocus, onSelect, onOpenGraph, inGraph, inMap, mapOpen, onToggleMap }: Props & { partition: Partition; community: Community }) {
  const { t } = useT();
  const path = pathTo(partition, community.id);
  const m = metrics?.get(community.id);
  const members = community.entityIds.map((id) => dataset.entities.get(id)).filter((e): e is Entity => e !== undefined);
  const children = community.childIds.map((id) => partition.communities.get(id)).filter((c): c is Community => c !== undefined);
  const report = community.report;

  return (
    <div className="inspector-body">
      {path.length > 1 && (
        <nav className="crumbs" aria-label={t("Parent communities")}>
          {path.slice(0, -1).map((p) => (
            <button key={p.id} className="crumb" onClick={() => onSelect(p.id)}>{p.title}</button>
          ))}
        </nav>
      )}
      <h2>{community.title}</h2>
      <p className="facts">
        {t("Level {level}. {entities} entities", { level: depthOfLevel(partition, community.level), entities: fmt(members.length) })}
        {m && t(", {internal} internal relationships", { internal: fmt(m.internalEdges) })}
        {m && m.internalEdges + m.boundaryEdges > 0 && t(" ({share} of its edges)", { share: pct(m.internalRatio) })}
        .{community.membershipSource === "relationship_ids" && ` ${t("Members were inferred from relationship endpoints.")}`}
      </p>
      {inGraph ? (
        <p className="muted">{t("Shown in the graph. Click a node for its neighbours.")}</p>
      ) : inMap ? (
        <div className="stack">
          <button className="btn primary" onClick={onToggleMap}>{mapOpen ? t("Close in map") : t("Open in map")}</button>
          <button className="btn" onClick={onOpenGraph}>{t("Open internal graph")}</button>
        </div>
      ) : (
        <button className="btn primary" onClick={onOpenGraph}>{t("Open internal graph")}</button>
      )}

      <div className="report">
        <h3>{t("Summary")}</h3>
        {report && report.summary ? <p>{report.summary}</p> : <p className="muted">{t("No report for this community.")}</p>}
        {report && report.findings.length > 0 && (
          <>
            <h3>{t("Findings")}</h3>
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
          <p className="muted">{t("Rank {rank}", { rank: report.rank })}{report.rankExplanation ? `. ${report.rankExplanation}` : ""}</p>
        )}
      </div>

      {children.length > 0 && (
        <>
          <h3>{t("Child communities")}</h3>
          <ul className="chips">
            {children.map((c) => (
              <li key={c.id}><button className="chip" onClick={() => onSelect(c.id)}>{c.title} ({fmt(c.entityIds.length)})</button></li>
            ))}
          </ul>
        </>
      )}

      <EvidenceList title="Source text" items={evidenceForCommunity(dataset, community)} hasUnits={dataset.textUnits.size > 0} />

      <h3>{t("Entities")}</h3>
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
        <p className="muted">{t("{n} more. Use the graph's search to find one.", { n: fmt(members.length - MEMBER_PREVIEW) })}</p>
      )}
    </div>
  );
}

function EntityPanel({ dataset, partition, community, onFocus, onSelect, inGraph, graphIds, onAddCommunity, onExplore, entityId }: Props & { entityId: string }) {
  const { t } = useT();
  const index = useMemo(() => (partition ? membershipIndex(partition) : new Map<string, Community[]>()), [partition]);
  const entity = dataset.entities.get(entityId);
  const relationships = useMemo(() => {
    const list = relationshipsOf(dataset, entityId);
    return list.sort((a, b) => Number(b.sourceId === entityId) - Number(a.sourceId === entityId) || a.type.localeCompare(b.type));
  }, [dataset, entityId]);
  if (!entity) return <div className="inspector-empty"><p>{t("This entity is not in the loaded dataset.")}</p></div>;
  const memberships = [...(index.get(entity.id) ?? [])].sort((a, b) => a.size - b.size);
  const short = displayTitle(entity);

  return (
    <div className="inspector-body">
      <nav className="crumbs">
        <button className="crumb" onClick={() => onFocus(null)}>{community ? community.title : t("Back")}</button>
      </nav>
      <h2>{short}</h2>
      <p className="facts">
        {t("{type}. {count} relationships.", { type: entity.type, count: fmt(relationships.length) })}
        {short !== entity.title && t(" Full title: {title}.", { title: entity.title })}
      </p>
      <Description text={entity.description} />
      <button className="btn primary" onClick={() => onExplore(entity.id)} title={t("Everything within two hops, across communities")}>{t("Explore neighbourhood")}</button>

      <h3>{t("Communities")}</h3>
      {memberships.length === 0 ? (
        <p className="muted">{t("Belongs to no community.")}</p>
      ) : (
        <ul className="chips">
          {memberships.map((c) => (
            <li key={c.id} className="stack">
              <button className="chip" onClick={() => onSelect(c.id)} title={t("Select this community")}>{partition ? levelLabel(partition, c.level) : `L${c.level}`} {c.title} ({fmt(c.entityIds.length)})</button>
              {inGraph && !graphIds.includes(c.id) && (
                <button className="chip" onClick={() => onAddCommunity(c.id)} title={t("Draw this community in the same graph")}>{t("+ add to graph")}</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>{t("Relationships")}</h3>
      <ul className="rel-list">
        {relationships.slice(0, RELATIONSHIP_PREVIEW).map((r) => {
          const outgoing = r.sourceId === entity.id;
          const other = dataset.entities.get(outgoing ? r.targetId : r.sourceId);
          return (
            <li key={r.id} className={outgoing ? "out" : "in"}>
              <span className="dir" aria-label={outgoing ? t("outgoing") : t("incoming")}>{outgoing ? "→" : "←"}</span>
              <button className="who" title={other?.title} onClick={() => other && onFocus({ kind: "entity", id: other.id })}>
                {other ? displayTitle(other) : "?"}
              </button>
              <button className="kind" title={r.description ?? r.type} onClick={() => onFocus({ kind: "relationship", id: r.id })}>{r.type}</button>
            </li>
          );
        })}
      </ul>
      {relationships.length > RELATIONSHIP_PREVIEW && <p className="muted">{t("{n} more.", { n: fmt(relationships.length - RELATIONSHIP_PREVIEW) })}</p>}

      <Claims dataset={dataset} entityId={entity.id} onFocus={onFocus} />
      <EvidenceList title="Source text" items={evidenceForEntity(dataset, entity.id)} hasUnits={dataset.textUnits.size > 0} />
    </div>
  );
}

/** GraphRAG claims about the entity, when the index shipped covariates. */
function Claims({ dataset, entityId, onFocus }: { dataset: Dataset; entityId: string; onFocus: (focus: GraphFocus) => void }) {
  const { t } = useT();
  if (dataset.covariates.length === 0) return null;
  const claims = claimsForEntity(dataset, entityId);
  return (
    <>
      <h3>{t("Claims")} ({fmt(claims.length)})</h3>
      {claims.length === 0 ? (
        <p className="muted">{t("No claim involves this entity.")}</p>
      ) : (
        <ul className="claims">
          {claims.map((c) => {
            const other = c.subjectId === entityId ? c.objectId : c.subjectId;
            const otherTitle = c.subjectId === entityId ? c.objectTitle : c.subjectTitle;
            return (
              <li key={c.id}>
                <span className="claim-type">{c.type}{c.status ? ` · ${c.status}` : ""}{c.startDate ? ` · ${c.startDate}${c.endDate ? ` to ${c.endDate}` : ""}` : ""}</span>
                <span className="claim-text">{c.description}</span>
                {other && otherTitle && (
                  <button className="chip" onClick={() => onFocus({ kind: "entity", id: other })}>{otherTitle}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const EVIDENCE_PREVIEW = 5;

/** Chunks behind an item, newest GraphRAG layouts first; older indexes without text units say so once. */
function EvidenceList({ title, items, hasUnits }: { title: string; items: Evidence[]; hasUnits: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!hasUnits) return null;
  return (
    <>
      <h3>{t(title)} ({fmt(items.length)})</h3>
      {items.length === 0 ? (
        <p className="muted">{t("No text unit mentions this.")}</p>
      ) : (
        <ul className="evidence">
          {items.slice(0, open.has("*") ? items.length : EVIDENCE_PREVIEW).map(({ unit, documentTitles }) => {
            const expanded = open.has(unit.id);
            return (
              <li key={unit.id}>
                <button
                  className="evidence-text"
                  onClick={() => setOpen((prev) => { const next = new Set(prev); if (next.has(unit.id)) next.delete(unit.id); else next.add(unit.id); return next; })}
                  title={expanded ? t("Show less") : t("Show the whole chunk")}
                >
                  {expanded ? unit.text : snippet(unit.text)}
                </button>
                <span className="evidence-doc">{documentTitles.join(", ") || t("no document")}{unit.tokens !== undefined && t(", {n} tokens", { n: fmt(unit.tokens) })}</span>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > EVIDENCE_PREVIEW && !open.has("*") && (
        <button className="btn" onClick={() => setOpen((prev) => new Set([...prev, "*"]))}>{t("Show all {n}", { n: fmt(items.length) })}</button>
      )}
    </>
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

function BundlePanel({ dataset, community, onFocus, bundle }: Props & { bundle: Extract<GraphFocus, { kind: "bundle" }> }) {
  const { t } = useT();
  const hub = dataset.entities.get(bundle.hubId);
  const members = bundle.entityIds.map((id) => dataset.entities.get(id)).filter((e): e is Entity => e !== undefined);
  return (
    <div className="inspector-body">
      <nav className="crumbs">
        <button className="crumb" onClick={() => onFocus(null)}>{community ? community.title : t("Back")}</button>
      </nav>
      <h2>{bundle.label}</h2>
      <p className="facts">
        {t("{count} entities of type {type}, each linked to {hub} by {relationship}.", { count: fmt(members.length), type: members[0]?.type ?? "", hub: hub ? displayTitle(hub) : bundle.hubId, relationship: bundle.relationshipType })}
      </p>
      {hub && <button className="chip" onClick={() => onFocus({ kind: "entity", id: hub.id })}>{t("Hub: {name}", { name: displayTitle(hub) })}</button>}
      <h3>{t("Entities")}</h3>
      <ul className="members">
        {members.map((e) => (
          <li key={e.id}>
            <button className="member-btn" onClick={() => onFocus({ kind: "entity", id: e.id })} title={e.title}>
              <span className="type">{e.type}</span>
              <span className="name">{displayTitle(e)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelationshipPanel({ dataset, community, onFocus, relationshipId }: Props & { relationshipId: string }) {
  const { t } = useT();
  const relationship = dataset.relationships.find((r) => r.id === relationshipId);
  if (!relationship) return <div className="inspector-empty"><p>{t("This relationship is not in the loaded dataset.")}</p></div>;
  const source = dataset.entities.get(relationship.sourceId);
  const target = dataset.entities.get(relationship.targetId);
  return (
    <div className="inspector-body">
      <nav className="crumbs">
        <button className="crumb" onClick={() => onFocus(null)}>{community ? community.title : t("Back")}</button>
      </nav>
      <h2>{source ? displayTitle(source) : "?"} → {target ? displayTitle(target) : "?"}</h2>
      <p className="facts">
        {relationship.type}
        {relationship.weight !== undefined && t(", weight {weight}", { weight: relationship.weight })}.
      </p>
      {relationship.description && <p className="desc">{relationship.description}</p>}
      <EvidenceList title="Source text" items={evidenceForRelationship(dataset, relationship.id)} hasUnits={dataset.textUnits.size > 0} />
      <div className="stack">
        {source && <button className="chip" onClick={() => onFocus({ kind: "entity", id: source.id })}>{t("Source: {name}", { name: displayTitle(source) })}</button>}
        {target && <button className="chip" onClick={() => onFocus({ kind: "entity", id: target.id })}>{t("Target: {name}", { name: displayTitle(target) })}</button>}
      </div>
    </div>
  );
}
