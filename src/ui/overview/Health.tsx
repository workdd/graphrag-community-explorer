// What this index will and will not answer.
//
// The quality view has the numbers. This says what they mean for a search and what to change, which
// is the question somebody actually has after paying for an index: build on it, or index it again.
import type { Affects, Destination, Finding, Severity } from "../../core/metrics/diagnosis";
import { countBySeverity } from "../../core/metrics/diagnosis";
import { fill, useT } from "../i18n";

interface Props {
  findings: Finding[];
  /** Opens the view that shows the records behind a finding. */
  onOpen: (to: Destination) => void;
  /** Runs the community detection a finding offers. */
  onDerive: () => void;
  deriving: boolean;
}

const AFFECTS: Record<Affects, string> = {
  global: "global search",
  local: "local search",
  both: "both searches",
  evidence: "evidence",
  none: "",
};

const SEVERITY_ORDER: Severity[] = ["fix", "watch"];

export function Health({ findings, onOpen, onDerive, deriving }: Props) {
  const { t } = useT();
  const problems = findings.filter((finding) => SEVERITY_ORDER.includes(finding.severity));
  const fine = findings.filter((finding) => finding.severity === "ok");
  const toFix = countBySeverity(findings, "fix");

  return (
    <section className="health">
      <div className="health-head">
        <h2>{t("What this index will and will not answer")}</h2>
        <span className={toFix > 0 ? "health-count warn" : "health-count"}>
          {problems.length === 0
            ? t("nothing to fix")
            : toFix > 0
              ? t("{n} to fix", { n: toFix })
              : t("{n} to keep an eye on", { n: problems.length })}
        </span>
      </div>

      {problems.length === 0 ? (
        <p className="muted">
          {t("Every check below passed. The numbers behind them are in the Quality view.")}
        </p>
      ) : (
        <ul className="findings">
          {problems.map((finding) => (
            <li key={finding.id} className={`finding ${finding.severity}`}>
              <div className="finding-head">
                <b>{fill(t(finding.title), finding.vars)}</b>
                {finding.affects === "none" ? null : (
                  <span className="affects">{t(AFFECTS[finding.affects])}</span>
                )}
              </div>
              <p>{fill(t(finding.detail), finding.vars)}</p>
              {finding.fix ? <p className="fix">{fill(t(finding.fix), finding.vars)}</p> : null}
              {finding.action === "derive" ? (
                <button className="btn small" onClick={onDerive} disabled={deriving}>
                  {deriving ? t("Finding communities…") : t("Find communities")}
                </button>
              ) : null}
              {finding.link ? (
                <button className="btn small" onClick={() => onOpen(finding.link!.to)}>
                  {t(finding.link.label)}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {fine.length > 0 ? (
        <details className="health-fine">
          <summary>{t("What looks fine ({n})", { n: fine.length })}</summary>
          <ul className="findings">
            {fine.map((finding) => (
              <li key={finding.id} className="finding ok">
                <div className="finding-head">
                  <b>{fill(t(finding.title), finding.vars)}</b>
                </div>
                <p>{fill(t(finding.detail), finding.vars)}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
