import { useState } from "react";
import type { SearchRun } from "../../core/search/types";
import { useT } from "../i18n";

interface Props {
  run: SearchRun;
}

/** The messages the run actually sent, so the prompt is inspectable rather than described. */
export function Pipeline({ run }: Props) {
  const { t } = useT();
  const [showPrompt, setShowPrompt] = useState(false);
  const stages = [...new Set(run.messages.map((m) => m.stage))];

  return (
    <div className="pipeline">
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
