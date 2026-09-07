import type { LoaderNote } from "../../core/loaders/graphrag";
import type { IntegrityFinding } from "../../core/metrics/integrity";
import { fmt } from "../format";
import { useT } from "../i18n";

interface Props {
  notes: LoaderNote[];
  findings: IntegrityFinding[];
}

export function IntegrityPanel({ notes, findings }: Props) {
  const { t } = useT();
  const warnings = [...notes.map((n) => ({ ...n, severity: "warning" as const })), ...findings.filter((f) => f.severity === "warning")];
  const infos = findings.filter((f) => f.severity === "info");
  const count = warnings.reduce((sum, w) => sum + w.count, 0);
  const rows = [...warnings, ...infos];
  return (
    <details className="integrity" open={count > 0}>
      <summary className={count > 0 ? "warn" : undefined}>
        {count === 0 ? t("Integrity: no problems found in the loaded files.") : t("Integrity: {n} rows need attention.", { n: fmt(count) })}
      </summary>
      <ul>
        {rows.map((row) => (
          <li key={row.kind}>
            <b>{t(row.label)}</b>: {fmt(row.count)}
            {row.samples.length > 0 && <span className="samples"> ({row.samples.slice(0, 3).join("; ")}{row.count > 3 ? "; …" : ""})</span>}
          </li>
        ))}
        {rows.length === 0 && <li className="muted">{t("Ids are unique, every member and parent resolves, and all relationships have both endpoints.")}</li>}
      </ul>
    </details>
  );
}
