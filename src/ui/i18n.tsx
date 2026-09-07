import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ko";
type Vars = Record<string, string | number>;

/**
 * Korean strings keyed by the English source text. Placeholders are {name}; **x** marks bold in
 * <Rich>. Anything missing falls back to English, so a new screen is never blank.
 */
const KO: Record<string, string> = {
  // load screen
  "Read a GraphRAG index the way it is organized: communities first, then the entities and relationships inside each one. Files are parsed in this tab and never uploaded.":
    "GraphRAG 인덱스를 구성된 순서대로 읽습니다. 커뮤니티가 먼저, 그 안의 엔티티와 관계는 그다음입니다. 파일은 이 탭 안에서만 처리되며 어디에도 업로드되지 않습니다.",
  "Drop a GraphRAG output folder here": "GraphRAG output 폴더를 여기에 놓으세요",
  "or click to choose the Parquet files": "또는 클릭해서 Parquet 파일 선택",
  "Open {path}": "{path} 열기",
  "Open the sample dataset": "샘플 데이터셋 열기",
  "A synthetic e-commerce platform with three levels of communities.": "세 단계 커뮤니티를 가진 가상의 전자상거래 플랫폼입니다.",
  "Configured in .env.development.local as VITE_DEFAULT_DATA.": ".env.development.local 의 VITE_DEFAULT_DATA 로 설정된 폴더입니다.",
  "Reading {label}…": "{label} 읽는 중…",
  "File": "파일",
  "Used for": "용도",
  "Required. Entity titles, types, descriptions.": "필수. 엔티티 제목·유형·설명.",
  "Required. Edges between entity titles.": "필수. 엔티티 제목 사이의 관계.",
  "Hierarchy, levels and members. Without it the dataset has no partition.": "계층·레벨·멤버. 없으면 커뮤니티 집합이 없습니다.",
  "Summaries, findings and ranks shown in the inspector.": "인스펙터에 보이는 요약·발견·순위.",
  "Any extra community set (for example leiden_communities.parquet) becomes a switchable partition.": "추가 커뮤니티 집합(예: leiden_communities.parquet)은 전환 가능한 집합이 됩니다.",
  "GraphRAG 0.3 to 2.x file names are recognized, including the create_final_ prefix. Hosted folders open with ?data=<url>.":
    "GraphRAG 0.3~2.x 파일명을 인식합니다(create_final_ 접두사 포함). 서버에 올린 폴더는 ?data=<url> 로 엽니다.",
  // top bar and tabs
  "Open another dataset": "다른 데이터셋 열기",
  "Community set": "커뮤니티 집합",
  "Overview": "개요",
  "Map": "지도",
  "Graph": "그래프",
  "Quality": "품질",
  "Select a community first": "먼저 커뮤니티를 선택하세요",
  "Loading view…": "화면 불러오는 중…",
  // rail
  "Dataset": "데이터셋",
  "Source": "출처",
  "Apache AGE export": "Apache AGE 내보내기",
  "GraphRAG output": "GraphRAG 출력",
  "Entity types": "엔티티 유형",
  "Relationship types": "관계 유형",
  "Find a community": "커뮤니티 찾기",
  "Collapse": "접기",
  "Expand": "펼치기",
  "{roots} top-level, {total} in total. Numbers are entity counts.": "최상위 {roots}개, 전체 {total}개. 숫자는 엔티티 수입니다.",
  "No communities.parquet was loaded, so there is no hierarchy to show.": "communities.parquet 가 없어 계층을 표시할 수 없습니다.",
  // overview summary
  "**{entities}** entities and **{relationships}** relationships.": "엔티티 **{entities}**개, 관계 **{relationships}**개.",
  "**{communities}** communities on **{levels}** level{s}{range}; **{covered}** entities ({coverage}) belong to at least one{multi}.":
    "커뮤니티 **{communities}**개, 레벨 **{levels}**개{range}; 엔티티 **{covered}**개({coverage})가 하나 이상에 소속{multi}.",
  ", **{n}** to more than one on the same level": ", 같은 레벨에서 둘 이상에 속한 엔티티 **{n}**개",
  "No community set loaded.": "불러온 커뮤니티 집합이 없습니다.",
  " **{isolated}** entities have no relationships.": " 관계가 없는 엔티티 **{isolated}**개.",
  // integrity
  "Integrity: no problems found in the loaded files.": "무결성: 불러온 파일에서 문제를 찾지 못했습니다.",
  "Integrity: {n} rows need attention.": "무결성: {n}건 확인이 필요합니다.",
  "Ids are unique, every member and parent resolves, and all relationships have both endpoints.": "ID 가 고유하고, 모든 멤버·부모 참조가 해석되며, 모든 관계에 양 끝점이 있습니다.",
  "Parent community not found": "부모 커뮤니티를 찾을 수 없음",
  "Parent chain loops back on itself": "부모 연결이 순환함",
  "Child members missing from the parent community": "하위 커뮤니티 멤버가 부모에 없음",
  "Stored size differs from the member count": "저장된 size 가 실제 멤버 수와 다름",
  "Communities without members": "멤버가 없는 커뮤니티",
  "Members inferred from relationship endpoints (no entity_ids column)": "멤버를 관계 끝점에서 추론함 (entity_ids 열 없음)",
  "Entities that belong to no community": "어느 커뮤니티에도 속하지 않는 엔티티",
  "Entities with no relationships": "관계가 없는 엔티티",
  "Entities share an id; later rows were skipped": "같은 id 의 엔티티가 있어 뒤의 행을 건너뜀",
  "Entities share a title; relationships resolve to the first one": "같은 제목의 엔티티가 있어 관계는 첫 번째로 연결됨",
  "Relationships whose endpoints match no entity were skipped": "끝점이 어떤 엔티티와도 맞지 않는 관계를 건너뜀",
  "Community members that match no entity were dropped": "엔티티와 맞지 않는 커뮤니티 멤버를 제외함",
  "Communities share an id; later rows were skipped": "같은 id 의 커뮤니티가 있어 뒤의 행을 건너뜀",
  // community table
  "Communities": "커뮤니티",
  "{shown} of {total}. Internal counts relationships with both ends inside; boundary counts those with one end outside.":
    "전체 {total}개 중 {shown}개. 내부는 양 끝이 안에 있는 관계 수, 경계는 한쪽이 밖에 있는 관계 수입니다.",
  "Filter by title": "제목으로 거르기",
  "Filter communities": "커뮤니티 거르기",
  "Download the rows below as CSV": "아래 행을 CSV 로 내려받기",
  "Community": "커뮤니티",
  "Level": "레벨",
  "Entities": "엔티티",
  "Internal": "내부",
  "Boundary": "경계",
  "Internal share": "내부 비율",
  "Rank": "순위",
  'No community title contains "{query}".': '"{query}" 를 포함하는 커뮤니티 제목이 없습니다.',
  // inspector
  "Select a community to read its report and members.": "커뮤니티를 선택하면 보고서와 멤버가 여기에 나옵니다.",
  "No community set is loaded.": "불러온 커뮤니티 집합이 없습니다.",
  "Parent communities": "상위 커뮤니티",
  "Level {level}. {entities} entities": "레벨 {level}. 엔티티 {entities}개",
  ", {internal} internal relationships": ", 내부 관계 {internal}개",
  " ({share} of its edges)": " (전체 관계의 {share})",
  "Members were inferred from relationship endpoints.": "멤버는 관계 끝점에서 추론했습니다.",
  "Shown in the graph. Click a node for its neighbours.": "그래프에 표시 중입니다. 노드를 클릭하면 이웃이 보입니다.",
  "Open in map": "지도에서 열기",
  "Close in map": "지도에서 닫기",
  "Open internal graph": "내부 그래프 열기",
  "Summary": "요약",
  "No report for this community.": "이 커뮤니티의 보고서가 없습니다.",
  "Findings": "발견",
  "Rank {rank}": "순위 {rank}",
  "Child communities": "하위 커뮤니티",
  "{n} more. Use the graph's search to find one.": "{n}개 더 있습니다. 그래프의 검색으로 찾을 수 있습니다.",
  "Source text": "원문",
  "No text unit mentions this.": "이것을 언급하는 원문 조각이 없습니다.",
  "Show less": "줄이기",
  "Show the whole chunk": "조각 전체 보기",
  "no document": "문서 없음",
  ", {n} tokens": ", {n} 토큰",
  "Show all {n}": "{n}개 모두 보기",
  "Back": "뒤로",
  "This entity is not in the loaded dataset.": "이 엔티티는 불러온 데이터셋에 없습니다.",
  "This relationship is not in the loaded dataset.": "이 관계는 불러온 데이터셋에 없습니다.",
  "{type}. {count} relationships.": "{type}. 관계 {count}개.",
  " Full title: {title}.": " 전체 제목: {title}.",
  "Belongs to no community.": "어느 커뮤니티에도 속하지 않습니다.",
  "Select this community": "이 커뮤니티 선택",
  "+ add to graph": "+ 그래프에 추가",
  "Draw this community in the same graph": "이 커뮤니티를 같은 그래프에 그리기",
  "Relationships": "관계",
  "outgoing": "나가는 관계",
  "incoming": "들어오는 관계",
  "{n} more.": "{n}개 더 있습니다.",
  ", weight {weight}": ", 가중치 {weight}",
  "Source: {name}": "출발: {name}",
  "Target: {name}": "도착: {name}",
  // graph
  "Remove {title} from the graph": "그래프에서 {title} 제거",
  "Find an entity": "엔티티 찾기",
  "Find": "찾기",
  "Labels": "라벨",
  "all": "전체",
  "selection only": "선택만",
  "top {n}": "상위 {n}",
  "Outside links": "바깥 관계",
  "Fit": "맞춤",
  "Frame the community": "커뮤니티에 맞추기",
  "All": "전부",
  "Frame everything, outside links included": "바깥 관계까지 전부 맞추기",
  "Re-layout": "재배치",
  "Recompute the layout from scratch": "배치를 처음부터 다시 계산",
  "Download the picture as a PNG at 2x": "그림을 2배 PNG 로 내려받기",
  "Download the map as a PNG at 2x": "지도를 2배 PNG 로 내려받기",
  "Show all types": "모든 유형 보기",
  "Highlight {type}": "{type} 강조",
  "Show {type}": "{type} 보이기",
  "Hide {type}": "{type} 숨기기",
  "{shown} of {members} entities, {internal} internal relationships": "엔티티 {members}개 중 {shown}개, 내부 관계 {internal}개",
  ", {boundary} outside links to {ghosts} entities drawn dashed": ", 바깥 엔티티 {ghosts}개로 가는 관계 {boundary}개는 점선",
  " ({hidden} more outside links not drawn)": " (바깥 관계 {hidden}개는 그리지 않음)",
  "Showing the most connected {shown}; raise the limit above to see all.": "연결이 많은 {shown}개만 표시 중입니다. 위의 상한을 올리면 전부 보입니다.",
  " makes up {share}% of the internal links; hide it in the relationship types above to see the rest of the structure.": " 관계가 내부 관계의 {share}%입니다. 위의 관계 유형에서 숨기면 나머지 구조가 보입니다.",
  "Click a node for its neighbours, a link for its detail, the background or Esc to clear. Drag nodes to tidy; positions are kept while you filter.":
    "노드를 클릭하면 이웃, 관계를 클릭하면 상세가 보입니다. 배경 클릭이나 Esc 로 해제합니다. 노드를 끌어 정리할 수 있고 필터를 바꿔도 위치가 유지됩니다.",
  // map
  "Show": "표시",
  "hierarchy, open to descend": "계층 (열어서 내려가기)",
  "all communities with parent links": "모든 커뮤니티 + 부모 링크",
  "level {level} side by side": "레벨 {level} 나란히",
  "Entities in no community": "미소속 엔티티",
  "Entity budget": "엔티티 상한",
  "Close all": "모두 닫기",
  "Computing layout…": "배치 계산 중…",
  "Not in any community": "어느 커뮤니티에도 없음",
  "Level {level}, ": "레벨 {level}, ",
  "{count} entities. Double-click to open.": "엔티티 {count}개. 더블클릭하면 열립니다.",
  "{count} entities. Double-click to close.": "엔티티 {count}개. 더블클릭하면 닫힙니다.",
  "**{a}** and **{b}**: {count} relationships between their entities": "**{a}**와 **{b}** 사이 관계 {count}개",
  "{communities} communities and {entities} entities drawn": "커뮤니티 {communities}개, 엔티티 {entities}개 표시",
  " ({truncated} more held back by the entity budget)": " (상한 때문에 {truncated}개 더 숨김)",
  ", {links} links between groups.": ", 그룹 사이 링크 {links}개.",
  " {total} entities belong to no community.": " 미소속 엔티티 {total}개.",
  "Double-click a community to open it: its child communities and its own members appear inside.": "커뮤니티를 더블클릭하면 열리고, 하위 커뮤니티와 자체 멤버가 안에 나타납니다.",
  "Parents do not contain their children in this data, so communities stand side by side; dashed arrows point to the parent. Double-click a community to see its members.":
    "이 데이터에서는 부모가 자식을 포함하지 않아 커뮤니티를 나란히 놓고, 점선 화살표가 부모를 가리킵니다. 더블클릭하면 멤버가 보입니다.",
  "One level side by side. Double-click a community to see its members.": "한 레벨을 나란히 표시합니다. 더블클릭하면 멤버가 보입니다.",
  " Line width is the number of relationships between two groups; click one for the count.": " 선 굵기는 두 그룹 사이 관계 수입니다. 클릭하면 건수가 보입니다.",
  " Layout {ms} ms{where}.": " 배치 {ms} ms{where}.",
  " off the main thread": " (워커)",
  " Layout restored from cache.": " 캐시에서 배치를 복원했습니다.",
  // quality
  "Levels": "레벨",
  "Modularity compares relationships inside communities against a random rewiring; above 0.3 usually means the grouping follows the graph. Coverage is the share of entities assigned at that level.":
    "모듈성은 커뮤니티 안의 관계가 무작위 연결보다 얼마나 많은지를 재는 값입니다. 0.3 이상이면 보통 묶음이 그래프 구조를 따른다고 봅니다. 커버리지는 그 레벨에 소속된 엔티티 비율입니다.",
  "Covered": "소속",
  "Coverage": "커버리지",
  "Modularity": "모듈성",
  "Median size": "중앙값 크기",
  "Largest": "최대",
  "Community sizes": "커뮤니티 크기",
  "Community sizes at level {level}": "레벨 {level} 커뮤니티 크기",
  "Two community sets side by side": "두 커뮤니티 집합 비교",
  "Each entity is assigned to its smallest community at the chosen level of each set. NMI and ARI are 1 when the two sets group the common entities the same way and near 0 when they are unrelated.":
    "각 엔티티는 두 집합의 선택한 레벨에서 가장 작은 커뮤니티에 배정됩니다. NMI 와 ARI 는 두 집합이 공통 엔티티를 같은 방식으로 묶으면 1, 무관하면 0 에 가깝습니다.",
  "**{common}** entities are grouped by both. NMI **{nmi}**, ARI **{ari}**.": "두 집합 모두에 묶인 엔티티 **{common}**개. NMI **{nmi}**, ARI **{ari}**.",
  " {n} entities only in A.": " A 에만 있는 엔티티 {n}개.",
  " {n} only in B.": " B 에만 있는 엔티티 {n}개.",
  "Shared entities": "공통 엔티티",
  "Share of A": "A 대비 비율",
  "Download all rows as CSV": "전체 행을 CSV 로 내려받기",
  "Density": "밀도",
  "Conductance": "컨덕턴스",
  "Relationships with both ends inside": "양 끝이 안에 있는 관계",
  "Relationships with one end outside": "한쪽 끝이 밖에 있는 관계",
  "Internal over internal plus boundary": "내부 / (내부 + 경계)",
  "Internal relationships over possible member pairs": "내부 관계 / 가능한 멤버 쌍",
  "Boundary over the volume touching the community: lower is more self-contained": "경계 / 커뮤니티에 닿는 전체 관계량. 낮을수록 자기완결적",
};

export function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

interface I18n {
  lang: Lang;
  t: (text: string, vars?: Vars) => string;
  setLang: (lang: Lang) => void;
}

const STORAGE_KEY = "gce.lang";
const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ko") return saved;
  } catch {
    // storage unavailable
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
};

const I18nContext = createContext<I18n>({ lang: "en", t: (text, vars) => fill(text, vars), setLang: () => undefined });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable
    }
  }, []);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (text, vars) => fill(lang === "ko" ? KO[text] ?? text : text, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext);

/** Translated text with **bold** segments rendered as <b>. */
export function Rich({ text, vars }: { text: string; vars?: Vars }) {
  const { t } = useT();
  const parts = t(text, vars).split("**");
  return <>{parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part))}</>;
}

/** The switch shows the language you would switch to. */
export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <button className="btn lang" onClick={() => setLang(lang === "ko" ? "en" : "ko")} title={lang === "ko" ? "Switch to English" : "한국어로 보기"}>
      {lang === "ko" ? "English" : "한국어"}
    </button>
  );
}
