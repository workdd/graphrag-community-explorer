import { useMemo } from "react";
import { snippet } from "../../core/evidence";
import { displayTitle } from "../../core/graph/palette";
import type { Dataset, Partition } from "../../core/model";
import { contextFor, describeTables, type ContextScope, type SchemaTable, type TableInfo, type TableKey } from "../../core/schema";
import { fmt } from "../format";
import type { GraphFocus } from "../graph/CommunityGraph";
import { useT } from "../i18n";

interface Props {
  dataset: Dataset;
  partition: Partition | null;
  tables: TableInfo[];
  selectedId: string | null;
  focus: GraphFocus;
  onSelect: (id: string) => void;
  onFocus: (focus: GraphFocus) => void;
  onOpenGraph: () => void;
}

/** The colours of the GraphRAG local-search figure: communities dark, entities blue, relationships green, text units red. */
export const TABLE_COLORS: Record<TableKey, string> = {
  communities: "#2f3437",
  community_reports: "#4d5560",
  entities: "#2467b3",
  relationships: "#4d8f2b",
  text_units: "#c2343c",
  documents: "#6f6a8a",
  covariates: "#b26a12",
};

const FILE_HINT: Record<TableKey, string> = {
  documents: "documents.parquet",
  text_units: "text_units.parquet",
  entities: "entities.parquet",
  relationships: "relationships.parquet",
  communities: "communities.parquet",
  community_reports: "community_reports.parquet",
  covariates: "covariates.parquet",
};

export function SchemaView({ dataset, partition, tables, selectedId, focus, onSelect, onFocus, onOpenGraph }: Props) {
  const { t } = useT();
  const schema = useMemo(() => describeTables(tables), [tables]);
  const scope: ContextScope = useMemo(() => {
    if (selectedId && partition?.communities.has(selectedId)) return { kind: "community", id: selectedId };
    if (focus?.kind === "entity" && dataset.entities.has(focus.id)) return { kind: "entity", id: focus.id };
    return { kind: "all" };
  }, [selectedId, partition, focus, dataset]);
  const context = useMemo(() => contextFor(dataset, partition, scope), [dataset, partition, scope]);
  const scopeTitle =
    scope.kind === "community"
      ? t("Rows behind {title}", { title: partition!.communities.get(scope.id)!.title })
      : scope.kind === "entity"
        ? t("Rows around {title}", { title: displayTitle(dataset.entities.get(scope.id)!) })
        : t("Rows for the whole index");
  const focusedEntity = focus?.kind === "entity" ? focus.id : null;
  const focusedRelationship = focus?.kind === "relationship" ? focus.id : null;
  const title = (id: string) => {
    const e = dataset.entities.get(id);
    return e ? displayTitle(e) : id;
  };

  return (
    <div className="schema">
      <section className="schema-tables">
        <h3>{t("Tables in this index")}</h3>
        <p className="muted">{t("Each Parquet file is a relational table. Key columns are marked, and reference columns say which table they point into; the graph is drawn from those references.")}</p>
        <div className="tcards">
          {schema.map((table) => (
            <TableCard key={table.name} table={table} />
          ))}
        </div>
      </section>

      <section className="schema-map">
        <h3>{t("How the tables become the picture")}</h3>
        <p className="muted">{t("Rows on the left, what they turn into on the right. Grey tables were not loaded; add the file to get that part of the picture.")}</p>
        <MappingDiagram schema={schema} />
      </section>

      <section className="schema-context">
        <div className="schema-context-head">
          <div>
            <h3>{scopeTitle}</h3>
            <p className="muted">
              {t("The same rows GraphRAG's local search ranks for a query: entities by degree, relationships inside the group before those leaving it, text units by how many of these rows they carry. Click a row to inspect it.")}
            </p>
          </div>
          {scope.kind === "community" && (
            <button className="btn" onClick={onOpenGraph}>{t("Open internal graph")}</button>
          )}
        </div>
        <div className="ctx-grid">
          <table className="ctx-table" data-kind="communities" style={{ "--tcolor": TABLE_COLORS.communities } as React.CSSProperties}>
            <thead>
              <tr>
                <th>{t("Community")}</th>
                <th>{t("Report")}</th>
                <th className="num">{t("Matches")}</th>
                <th className="num">{t("Rank")}</th>
              </tr>
            </thead>
            <tbody>
              {context.communities.length === 0 && (
                <tr className="empty"><td colSpan={4}>{partition ? t("No community contains these rows.") : t("No communities.parquet was loaded.")}</td></tr>
              )}
              {context.communities.map((row) => (
                <tr key={row.community.id} className={row.community.id === selectedId ? "selected" : ""} onClick={() => onSelect(row.community.id)}>
                  <td className="title"><span className="level-tag" data-depth={row.community.level}>L{row.community.level}</span> {row.community.title}</td>
                  <td className="text"><span className="clamp">{row.community.report ? snippet(row.community.report.summary, 90) : "…"}</span></td>
                  <td className="num">{fmt(row.matches)}</td>
                  <td className="num">{row.rank === undefined ? "…" : row.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="ctx-table" data-kind="entities" style={{ "--tcolor": TABLE_COLORS.entities } as React.CSSProperties}>
            <thead>
              <tr>
                <th>{t("Entity")}</th>
                <th>{t("Desc.")}</th>
                <th className="num">{t("Degree")}</th>
              </tr>
            </thead>
            <tbody>
              {context.entities.map(({ entity }) => (
                <tr key={entity.id} className={entity.id === focusedEntity ? "selected" : ""} onClick={() => onFocus({ kind: "entity", id: entity.id })}>
                  <td className="title"><span className="type-tag">{entity.type}</span> {displayTitle(entity)}</td>
                  <td className="text"><span className="clamp">{entity.description ? snippet(entity.description, 90) : "…"}</span></td>
                  <td className="num">{fmt(entity.degree)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="ctx-table" data-kind="relationships" style={{ "--tcolor": TABLE_COLORS.relationships } as React.CSSProperties}>
            <thead>
              <tr>
                <th>{t("Source")}</th>
                <th>{t("Target")}</th>
                <th>{t("Desc.")}</th>
                <th className="num">{t("Com. degree")}</th>
                <th className="num">{t("Links")}</th>
              </tr>
            </thead>
            <tbody>
              {(["in", "out"] as const).map((network) => {
                const rows = context.relationships.filter((r) => r.network === network);
                if (rows.length === 0) return null;
                return [
                  <tr key={`${network}-head`} className="group">
                    <td colSpan={5}>{network === "in" ? t("in-network: both ends among these entities") : t("out-network: one end among these entities")}</td>
                  </tr>,
                  ...rows.map(({ relationship, combinedDegree, links }) => (
                    <tr key={relationship.id} className={relationship.id === focusedRelationship ? "selected" : ""} onClick={() => onFocus({ kind: "relationship", id: relationship.id })}>
                      <td className="title">{title(relationship.sourceId)}</td>
                      <td className="title">{title(relationship.targetId)}</td>
                      <td className="text"><span className="clamp">{relationship.description ? snippet(relationship.description, 70) : relationship.type}</span></td>
                      <td className="num">{fmt(combinedDegree)}</td>
                      <td className="num">{links > 0 ? fmt(links) : "…"}</td>
                    </tr>
                  )),
                ];
              })}
              {context.relationships.length === 0 && <tr className="empty"><td colSpan={5}>{t("No relationships touch these entities.")}</td></tr>}
            </tbody>
          </table>

          <table className="ctx-table" data-kind="text_units" style={{ "--tcolor": TABLE_COLORS.text_units } as React.CSSProperties}>
            <thead>
              <tr>
                <th>{t("Text unit")}</th>
                <th>{t("Text")}</th>
                <th className="num">{t("Entities")}</th>
                <th className="num">{t("Relationships")}</th>
              </tr>
            </thead>
            <tbody>
              {context.textUnits.length === 0 && (
                <tr className="empty"><td colSpan={4}>{dataset.textUnits.size === 0 ? t("No text_units.parquet was loaded.") : t("No text unit mentions these rows.")}</td></tr>
              )}
              {context.textUnits.map(({ unit, entityHits, relationshipHits }) => (
                <tr key={unit.id}>
                  <td className="mono">{unit.id.slice(0, 8)}</td>
                  <td className="text"><span className="clamp">{snippet(unit.text, 110)}</span></td>
                  <td className="num">{fmt(entityHits)}</td>
                  <td className="num">{fmt(relationshipHits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TableCard({ table }: { table: SchemaTable }) {
  const { t } = useT();
  const color = TABLE_COLORS[table.key];
  return (
    <div className={`tcard${table.loaded ? "" : " missing"}`} style={{ "--tcolor": color } as React.CSSProperties}>
      <div className="tcard-head">
        <span className="tcard-name">{table.name}</span>
        <span className="tcard-rows">{table.loaded ? t("{n} rows", { n: fmt(table.rows) }) : t("not loaded")}</span>
      </div>
      <div className="tcard-becomes">{table.loaded ? t(table.becomes) : t("Add {file} for: {becomes}", { file: FILE_HINT[table.key], becomes: t(table.becomes) })}</div>
      <ul className="tcard-cols">
        {table.columns.map((column) => (
          <li key={column.name} className={`col ${column.kind}${column.dangling ? " dangling" : ""}`} title={column.kind === "ref" ? t("References {table}.{column}", { table: column.ref!.to, column: column.ref!.toColumn }) : undefined}>
            <span className="col-name">{column.name}</span>
            {column.ref && <span className="col-ref">→ {column.ref.to}.{column.ref.toColumn}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two columns of boxes: tables on the left, the drawn element on the right, one arrow per table. */
function MappingDiagram({ schema }: { schema: SchemaTable[] }) {
  const { t } = useT();
  const rows = schema.filter((s) => !s.extra);
  const rowH = 64;
  const width = 620;
  const height = rows.length * rowH + 16;
  const leftX = 8;
  const leftW = 168;
  const rightX = 352;
  const rightW = 260;
  const boxH = 46;
  return (
    <svg className="schema-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("How the tables become the picture")}>
      <defs>
        <marker id="schema-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {rows.map((table, i) => {
        const y = 8 + i * rowH;
        const color = table.loaded ? TABLE_COLORS[table.key] : "#b8bec6";
        const mid = y + boxH / 2;
        // The columns that drive the drawing, kept short enough for the gap between the boxes.
        const driving = table.columns.filter((c) => c.kind === "ref" || c.kind === "used").map((c) => c.name);
        const full = driving.join(", ");
        const label = full.length > 28 ? `${full.slice(0, 26).replace(/,\s*\w*$/, "")}, …` : full;
        return (
          <g key={table.name} className={table.loaded ? "" : "missing"}>
            <rect x={leftX} y={y} width={leftW} height={boxH} rx={6} fill={color} />
            <text x={leftX + 12} y={y + 19} fill="#fff" fontSize={13} fontWeight={600}>{table.name}</text>
            <text x={leftX + 12} y={y + 36} fill="#fff" fontSize={11} opacity={0.85}>{table.loaded ? t("{n} rows", { n: fmt(table.rows) }) : t("not loaded")}</text>
            <path d={`M ${leftX + leftW} ${mid} C ${leftX + leftW + 60} ${mid}, ${rightX - 60} ${mid}, ${rightX - 2} ${mid}`} stroke={color} strokeWidth={1.5} fill="none" markerEnd="url(#schema-arrow)" strokeDasharray={table.loaded ? undefined : "4 4"} />
            <text x={(leftX + leftW + rightX) / 2} y={mid - 7} textAnchor="middle" fontSize={10} fill="#5f6b78">
              <title>{full}</title>
              {label}
            </text>
            <rect x={rightX} y={y} width={rightW} height={boxH} rx={6} fill="#fff" stroke={color} strokeWidth={1.5} strokeDasharray={table.loaded ? undefined : "4 4"} />
            <g transform={`translate(${rightX + 8}, ${y + 3})`}>
              <Glyph kind={table.key} color={color} />
            </g>
            <foreignObject x={rightX + 54} y={y + 4} width={rightW - 60} height={boxH - 8}>
              <div className="schema-svg-text">{t(table.becomes)}</div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

/** 40x40 pictures of the drawn element. */
function Glyph({ kind, color }: { kind: TableKey; color: string }) {
  switch (kind) {
    case "entities":
      return (
        <g>
          <circle cx={20} cy={18} r={9} fill={color} />
          <rect x={8} y={30} width={24} height={4} rx={2} fill={color} opacity={0.6} />
        </g>
      );
    case "relationships":
      return (
        <g>
          <circle cx={8} cy={20} r={5} fill={color} />
          <circle cx={32} cy={20} r={5} fill={color} />
          <path d="M 13 20 L 27 20" stroke={color} strokeWidth={2.5} markerEnd="url(#schema-arrow)" />
        </g>
      );
    case "communities":
      return (
        <g>
          <path d="M 6 22 C 4 8, 20 4, 28 8 C 38 12, 38 30, 26 34 C 16 38, 6 34, 6 22 Z" fill={color} opacity={0.18} stroke={color} strokeWidth={1.2} />
          <circle cx={15} cy={18} r={3.5} fill={color} />
          <circle cx={26} cy={15} r={3.5} fill={color} />
          <circle cx={22} cy={27} r={3.5} fill={color} />
        </g>
      );
    case "community_reports":
      return (
        <g>
          <rect x={7} y={6} width={26} height={30} rx={3} fill="#fff" stroke={color} strokeWidth={1.5} />
          <rect x={11} y={12} width={18} height={3} rx={1.5} fill={color} />
          <rect x={11} y={19} width={14} height={2.5} rx={1.25} fill={color} opacity={0.6} />
          <rect x={11} y={25} width={16} height={2.5} rx={1.25} fill={color} opacity={0.6} />
        </g>
      );
    case "text_units":
      return (
        <g>
          <rect x={6} y={9} width={28} height={3} rx={1.5} fill={color} />
          <rect x={6} y={16} width={22} height={3} rx={1.5} fill={color} opacity={0.75} />
          <rect x={6} y={23} width={26} height={3} rx={1.5} fill={color} opacity={0.75} />
          <rect x={6} y={30} width={16} height={3} rx={1.5} fill={color} opacity={0.5} />
        </g>
      );
    case "documents":
      return (
        <g>
          <path d="M 10 6 H 24 L 31 13 V 35 H 10 Z" fill="#fff" stroke={color} strokeWidth={1.5} />
          <path d="M 24 6 V 13 H 31" fill="none" stroke={color} strokeWidth={1.5} />
          <rect x={14} y={19} width={12} height={2.5} rx={1.25} fill={color} opacity={0.7} />
          <rect x={14} y={25} width={10} height={2.5} rx={1.25} fill={color} opacity={0.7} />
        </g>
      );
    case "covariates":
      return (
        <g>
          <circle cx={17} cy={22} r={9} fill="#8c96a0" opacity={0.5} />
          <circle cx={27} cy={13} r={7} fill={color} />
          <path d="M 23.5 13 L 26 15.5 L 30.5 10.5" stroke="#fff" strokeWidth={1.8} fill="none" />
        </g>
      );
  }
}
