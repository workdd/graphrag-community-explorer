import { useState } from "react";
import { describeRun } from "../../core/search/pipeline";
import type { CitedShortIds } from "../../core/search/highlight";
import type { SearchRun } from "../../core/search/types";
import { useT } from "../i18n";

interface Props {
  run: SearchRun;
  cited: CitedShortIds;
}

/**
 * The route the question took, with the figures the run recorded. It sits above the evidence because
 * the first question a reader has is not "what was used" but "what happened".
 */
export function Pipeline({ run, cited }: Props) {
  const { t } = useT();
  const [showPrompt, setShowPrompt] = useState(false);
  const steps = describeRun(run, cited);
  const stages = [...new Set(run.messages.map((m) => m.stage))];

  return (
    <div className="pipeline">
      <ol className="chain">
        {steps.map((step) => (
          <li key={step.key}>
            <span className="what">{t(step.label)}</span>
            {step.value ? <b>{step.value}</b> : null}
            {step.detail ? <span className="muted">{t(step.detail)}</span> : null}
          </li>
        ))}
      </ol>
      <button className="btn small" onClick={() => setShowPrompt((v) => !v)} disabled={run.messages.length === 0}>
        {showPrompt ? t("Hide the prompt") : t("Show the prompt sent to the model")}
      </button>
      {showPrompt ? (
        <div className="prompt-dump">
          {stages.map((stage) => (
            <div key={stage}>
              <h4>
                {stage}
                <span className="muted">
                  {t("{n} messages, {chars} characters", {
                    n: run.messages.filter((m) => m.stage === stage).length,
                    chars: run.messages.filter((m) => m.stage === stage).reduce((s, m) => s + m.content.length, 0).toLocaleString(),
                  })}
                </span>
              </h4>
              {run.messages
                .filter((m) => m.stage === stage)
                .map((message, i) => (
                  <details key={i} open={message.role === "user"}>
                    <summary>
                      {message.role} <span className="muted">{message.content.length.toLocaleString()}</span>
                    </summary>
                    <pre>{message.content}</pre>
                  </details>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
