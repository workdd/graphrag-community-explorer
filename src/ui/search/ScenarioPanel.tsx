import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "../../core/model";
import { testScenarios } from "../../core/search/scenarios";
import type { SearchMethod } from "../../core/search/types";
import { downloadText } from "../download";
import { useT } from "../i18n";
import "./scenarios.css";

export function ScenarioPanel({ dataset, method, busy, localReady, globalReady, onChoose }: {
  dataset: Dataset;
  method: SearchMethod;
  busy: boolean;
  localReady: boolean;
  globalReady: boolean;
  onChoose: (question: string, method: SearchMethod) => void;
}) {
  const { lang } = useT();
  const [filter, setFilter] = useState(method);
  useEffect(() => setFilter(method), [method]);
  const scenarios = useMemo(() => testScenarios(dataset, lang), [dataset, lang]);
  const s = (ko: string, en: string) => lang === "ko" ? ko : en;
  if (!scenarios.length) return null;
  const available = filter === "local" ? localReady : globalReady;
  return <details className="scenario-panel">
    <summary>{s("성능 테스트 시나리오", "Performance test scenarios")} · {filter === "local" ? "Local" : "Global"} ({scenarios.filter(c => c.method === filter).length})</summary>
    <p className="muted">{s("현재 데이터의 실제 엔티티로 만든 질문입니다. 선택하면 입력창에 채워지며 자동 전송하지 않습니다. Local / Global 탭을 바꿔 다른 시나리오도 확인하세요.", "Questions use entities in this index. Selecting one fills the composer without sending it. Switch Local / Global tabs for more cases.")}</p>
    <label>{s("시나리오 검색 방식", "Scenario method")} <select className="field" value={filter} onChange={e => setFilter(e.target.value as SearchMethod)}><option value="local">Local</option><option value="global">Global</option></select></label>
    {!available ? <p className="notice warn">{s("이 방식에 필요한 임베딩 또는 보고서가 준비되지 않았습니다.", "Required embeddings or reports are unavailable for this method.")}</p> : null}
    <div className="scenario-grid">{scenarios.filter(c => c.method === filter).map(c => <article key={c.id} className="scenario-card">
      <div className="row"><b>{c.id} · {c.title}</b>{c.boundary ? <span className="muted">{s("한계 확인", "Boundary test")}</span> : null}</div>
      <p>{c.question}</p>
      <details><summary>{s("평가 기준", "What to check")}</summary><p className="muted">{c.check}</p></details>
      <button className="btn" disabled={busy || !available} onClick={() => onChoose(c.question, c.method)}>{s("이 질문 사용", "Use question")}</button>
    </article>)}</div>
    <div className="row scenario-footer"><button className="btn" onClick={() => downloadText("cmp-search-scenarios.json", JSON.stringify({ schemaVersion: 1, note: "Manual scenarios, not validated ground truth", scenarios }, null, 2))}>{s("전체 시나리오 JSON 저장", "Save all scenarios as JSON")}</button><span className="muted">{s("같은 모델·질문으로 비교하고 실행 저장에서 근거·시간·토큰을 남기세요. 집계·보류 문항은 검색의 한계를 확인합니다.", "Compare the same models and questions; save runs with evidence, time and tokens. Count and abstention cases probe retrieval limits.")}</span></div>
  </details>;
}
