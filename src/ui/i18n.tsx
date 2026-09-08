import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ko";
type Vars = Record<string, string | number>;

/**
 * Korean strings keyed by the English source text. Placeholders are {name}; **x** marks bold in
 * <Rich>. Anything missing falls back to English, so a new screen is never blank.
 */
const KO: Record<string, string> = {
  "The Ask tab is the exception: a question sends the evidence it selected to the model provider you configure.":
    "Ask 탭은 예외입니다. 질문하면 선택된 근거가 설정한 모델 제공자에게 전송됩니다.",
  "Optional sidecar of entity vectors. Local search in the Ask tab needs it; the embed_index tool writes one.":
    "선택 사항. 엔티티 벡터 사이드카입니다. Ask 탭의 Local 검색에 필요하며 embed_index 도구가 만듭니다.",
  "Upstage splits its embedding model in two. Build the file with …-passage and ask with …-query.":
    "Upstage 는 임베딩 모델이 저장용과 질문용으로 나뉩니다. 파일은 …-passage 로 만들고 질문은 …-query 로 합니다.",
  "preset":
    "사전 설정",
  "Set before start by VITE_LLM_* in the environment":
    "실행 전 환경변수 VITE_LLM_* 로 설정된 값입니다",
  "The key comes from the environment this app was started with. Typing one here keeps it in this browser instead. The build refuses to publish an environment key unless it is asked to.":
    "키는 앱을 실행한 환경에서 가져왔습니다. 여기에 직접 입력하면 그 값이 이 브라우저에만 저장되어 우선합니다. 빌드는 환경변수 키를 명시적으로 허용하기 전에는 배포하지 않습니다.",
  // search
  "Reports": "보고서",
  "Ask": "질문",
  "Ask a question and follow the answer back to the records it cites":
    "질문하고 답변이 인용한 레코드로 되짚어 갑니다",
  "Local": "Local",
  "Global": "Global",
  "Asking…": "묻는 중…",
  "Stop": "중단",
  "Needs embeddings.parquet": "embeddings.parquet 이 필요합니다",
  "Needs community_reports.parquet": "community_reports.parquet 이 필요합니다",
  "Provider: {key}": "제공자: {key}",
  "Set up a provider": "제공자 설정",
  "Open a trace": "저장된 실행 열기",
  "Save this run": "이 실행 저장",
  "Browsing stays in this tab. **Asking a question sends the selected evidence to the provider you configure.**":
    "탐색은 이 탭 안에서만 이루어집니다. **질문하면 선택된 근거가 설정한 제공자에게 전송됩니다.**",
  "Provider": "제공자",
  "Forget the key": "키 지우기",
  "Base URL": "기준 주소",
  "API key": "API 키",
  "Chat model": "채팅 모델",
  "Embedding model": "임베딩 모델",
  "The key is kept in this browser only. It is never written into a saved run. Clear it on a shared computer.":
    "키는 이 브라우저에만 보관되며 저장한 실행 파일에는 들어가지 않습니다. 공용 컴퓨터에서는 지우세요.",
  "The embeddings file was made from a different index ({files}). Local search is off.":
    "임베딩 파일이 다른 색인에서 만들어졌습니다({files}). Local 검색을 끕니다.",
  "Local search needs an embeddings.parquet next to the index. The embed_index tool writes one.":
    "Local 검색은 색인 옆의 embeddings.parquet 이 필요합니다. embed_index 도구가 만들어 줍니다.",
  "Global reads {reports} reports in {batches} batches, so this question costs about {calls} model calls.":
    "Global 은 보고서 {reports}건을 {batches}개 배치로 읽으므로 이 질문에 모델 호출이 약 {calls}회 듭니다.",
  "Ask about this index": "이 색인에 대해 질문하세요",
  "Showing a saved run from {tool} {version}, made on {when}.": "{tool} {version} 이 {when} 에 저장한 실행입니다.",
  "This trace was made from another index ({files}), so its citations are not linked.":
    "다른 색인에서 만들어진 실행이라({files}) 인용을 레코드에 연결하지 않습니다.",
  "Nothing in this index was close enough to the question to answer it.":
    "질문에 가까운 내용이 이 색인에 없어 답을 만들지 않았습니다.",
  "Engine": "엔진",
  "Method": "방식",
  "Model calls": "모델 호출",
  "Tokens": "토큰",
  "not reported": "수집되지 않음",
  "Elapsed": "경과",
  "Used as evidence": "근거로 사용됨",
  "Score": "점수",
  "The answer cited a number that is not in the context.": "컨텍스트에 없는 번호를 인용했습니다.",
  "Sources": "원문",
  "English": "한국어",
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
  "Claims": "주장",
  "No claim involves this entity.": "이 엔티티와 관련된 주장이 없습니다.",
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
  "Around {entity}": "{entity} 주변",
  "Fold leaves": "잎 묶기",
  "See on map": "지도에서 보기",
  "Network": "전체 그래프",
  "Every entity and relationship; communities are an overlay you turn on": "엔티티와 관계 전체. 커뮤니티는 켜서 얹는 겹입니다",
  "Arrange": "배치",
  "free": "자유",
  "layers by entity type": "엔티티 유형별 레이어",
  "Order": "정렬",
  "most connected first": "연결 많은 순",
  "by name": "이름 순",
  "off": "끄기",
  "node colour": "노드 색",
  "Show or hide this entity type": "이 엔티티 유형 보이기/숨기기",
  "Show or hide this relationship type": "이 관계 유형 보이기/숨기기",
  "Laying out {n} entities…": "엔티티 {n}개 배치 중…",
  "{shown} of {total} entities and {edges} relationships drawn.": "엔티티 {total}개 중 {shown}개와 관계 {edges}개를 그렸습니다.",
  "The busiest are kept; raise the entity budget to see more.": "연결이 많은 쪽을 남깁니다. 더 보려면 엔티티 상한을 올리세요.",
  "Layout {ms} ms off the main thread.": "배치 {ms} ms, 메인 스레드 밖.",
  "Columns are ordered so {share} of relationships point forward; the ones that do not are dashed red.": "관계의 {share}가 앞으로 흐르도록 열을 정렬했습니다. 거스르는 관계는 빨간 점선입니다.",
  "Click a node for its neighbours, a link for its detail, the background to clear.": "노드를 누르면 이웃, 선을 누르면 상세, 배경을 누르면 해제됩니다.",
  "Community of {title}": "{title}의 커뮤니티",
  "Formation": "형성 과정",
  "Run Leiden here and watch the communities form": "레이덴을 여기서 돌려 커뮤니티가 만들어지는 과정을 봅니다",
  "Run on": "실행 대상",
  "the whole index ({n} entities)": "인덱스 전체 (엔티티 {n}개)",
  "the {n} best connected entities": "연결이 많은 엔티티 {n}개",
  "{title} only": "{title}만",
  "Resolution": "해상도",
  "Seed": "시드",
  "Back to the start": "처음으로",
  "Play": "재생",
  "Pause": "일시정지",
  "Speed": "속도",
  "Step": "단계",
  "step {index} of {total}": "{total}단계 중 {index}",
  "Local moving": "지역 이동",
  "Refinement": "정제",
  "Aggregation": "집약",
  "Start": "시작",
  "Done": "완료",
  "round {round}": "{round}회차",
  ", sweep {pass}": ", {pass}번째 훑기",
  "Every entity starts in a community of its own.": "모든 엔티티가 자기 혼자만의 커뮤니티에서 출발합니다.",
  "Local moving: each entity joins the neighbouring community that raises modularity the most. It repeats until a sweep moves nobody.": "지역 이동: 각 엔티티가 모듈성을 가장 많이 올리는 이웃 커뮤니티로 옮겨 갑니다. 한 번 훑어도 아무도 움직이지 않을 때까지 반복합니다.",
  "Refinement: inside each community every entity starts alone again and only merges with well connected neighbours. This is what keeps a community from falling into disconnected pieces, which is Leiden's fix to Louvain.": "정제: 커뮤니티 안에서 각 엔티티가 다시 혼자가 된 뒤 잘 연결된 이웃하고만 합쳐집니다. 커뮤니티가 끊어진 조각으로 갈라지지 않게 막는 단계이고, 레이덴이 루뱅을 고친 지점입니다.",
  "Aggregation: each refined group becomes a single node carrying its internal weight as a self loop, and the next round moves those nodes. The communities of this round become the next level up.": "집약: 정제된 묶음이 내부 가중치를 자기 고리로 가진 노드 하나가 되고, 다음 회차는 그 노드들을 옮깁니다. 이번 회차의 커뮤니티가 한 단계 위 레벨이 됩니다.",
  "No sweep moves anything: the run is finished.": "더 이상 아무도 움직이지 않아 실행이 끝났습니다.",
  "Entities that moved": "이동한 엔티티",
  "Working graph": "작업 그래프",
  "Modularity per step": "단계별 모듈성",
  "{steps} steps in {ms} ms on {nodes} entities and {edges} relationships. Final modularity {q}, {communities} communities over {levels} levels.": "엔티티 {nodes}개, 관계 {edges}개에서 {steps}단계를 {ms} ms에 실행했습니다. 최종 모듈성 {q}, 커뮤니티 {communities}개, 레벨 {levels}단.",
  "Against the loaded community set at this step: NMI {nmi}, ARI {ari}.": "이 단계와 불러온 커뮤니티 집합 비교: NMI {nmi}, ARI {ari}.",
  "Leiden is run in this browser on the entities above; the loaded communities are never changed.": "레이덴은 위 엔티티를 대상으로 이 브라우저에서 실행되며, 불러온 커뮤니티는 바뀌지 않습니다.",
  "Folders this server was started with. They stay on this machine.": "이 서버가 넘겨받은 폴더입니다. 이 컴퓨터를 벗어나지 않습니다.",
  "Level {level} in the file": "파일에서는 레벨 {level}",
  "Levels are shown from the root down, so the root reads L0; this file numbers it L{source}.": "레벨은 위에서 아래로 표시하므로 루트가 L0입니다. 이 파일은 루트를 L{source}로 적었습니다.",
  "Schema": "스키마",
  "The tables behind the graph and the rows behind the selection": "그래프 뒤의 테이블과 선택 항목 뒤의 행",
  "Tables in this index": "이 인덱스의 테이블",
  "Each Parquet file is a relational table. Key columns are marked, and reference columns say which table they point into; the graph is drawn from those references.": "Parquet 파일 하나가 관계형 테이블 하나입니다. 키 열은 표시되고, 참조 열은 어느 테이블을 가리키는지 보여 줍니다. 그래프는 이 참조로 그려집니다.",
  "How the tables become the picture": "테이블이 그림이 되는 과정",
  "Rows on the left, what they turn into on the right. Grey tables were not loaded; add the file to get that part of the picture.": "왼쪽은 행, 오른쪽은 그 행이 화면에서 되는 것입니다. 회색 테이블은 로드되지 않았고, 파일을 추가하면 그 부분이 채워집니다.",
  "Rows behind {title}": "{title} 뒤의 행",
  "Rows around {title}": "{title} 주변의 행",
  "Rows for the whole index": "인덱스 전체의 행",
  "The same rows GraphRAG's local search ranks for a query: entities by degree, relationships inside the group before those leaving it, text units by how many of these rows they carry. Click a row to inspect it.": "GraphRAG 로컬 검색이 질의마다 순위를 매기는 바로 그 행입니다. 엔티티는 연결 수 순, 관계는 그룹 안쪽이 바깥으로 나가는 것보다 먼저, 텍스트 유닛은 이 행들을 많이 담은 순입니다. 행을 누르면 상세를 봅니다.",
  "Report": "리포트",
  "Matches": "일치",
  "Entity": "엔티티",
  "Desc.": "설명",
  "Degree": "연결 수",
  "Target": "도착",
  "Com. degree": "합산 연결 수",
  "Links": "링크",
  "Text unit": "텍스트 유닛",
  "Text": "본문",
  "in-network: both ends among these entities": "네트워크 안: 양 끝이 모두 이 엔티티들",
  "out-network: one end among these entities": "네트워크 밖: 한쪽 끝만 이 엔티티들",
  "No community contains these rows.": "이 행을 담은 커뮤니티가 없습니다.",
  "No communities.parquet was loaded.": "communities.parquet 가 로드되지 않았습니다.",
  "No relationships touch these entities.": "이 엔티티에 닿는 관계가 없습니다.",
  "No text_units.parquet was loaded.": "text_units.parquet 가 로드되지 않았습니다.",
  "No text unit mentions these rows.": "이 행을 언급하는 텍스트 유닛이 없습니다.",
  "{n} rows": "{n}행",
  "not loaded": "로드되지 않음",
  "Add {file} for: {becomes}": "{file} 을 추가하면: {becomes}",
  "References {table}.{column}": "{table}.{column} 참조",
  "Documents that the text units were cut from": "텍스트 유닛을 잘라낸 원본 문서",
  "Source text shown behind a node, an edge or a community": "노드·엣지·커뮤니티 뒤에 보여 주는 원문",
  "A node: label from title, colour from type, size from degree": "노드: 라벨은 title, 색은 type, 크기는 degree",
  "An edge from source to target, width from weight": "source 에서 target 으로 가는 엣지, 굵기는 weight",
  "A cloud around its member nodes; parent nests the clouds and builds the map": "멤버 노드를 감싸는 구름. parent 가 구름을 중첩시키고 지도를 만듭니다",
  "Summary, findings and rank on the community panel": "커뮤니티 패널의 요약·발견·순위",
  "Claims listed on the entity panel": "엔티티 패널에 나열되는 주장(claim)",
  "Another community set, switchable in the top bar": "상단 바에서 전환할 수 있는 또 다른 커뮤니티 집합",
  "Needs communities.parquet": "communities.parquet 가 필요합니다",
  "No communities.parquet was loaded. Pick an entity on the left and open its neighbourhood; the map and quality views need communities.": "communities.parquet 가 없습니다. 왼쪽에서 엔티티를 골라 이웃을 열어 보세요. 지도와 품질 화면은 커뮤니티가 있어야 합니다.",
  "No community set is loaded. Pick an entity on the left to read it and explore its neighbourhood.": "커뮤니티 집합이 없습니다. 왼쪽에서 엔티티를 고르면 상세와 이웃 탐색을 쓸 수 있습니다.",
  "No community set: {shown} of {total} entities, most connected first.": "커뮤니티 집합 없음: 엔티티 {total}개 중 {shown}개, 연결이 많은 순.",
  "Recommended. Hierarchy, levels and members; without it only the entity list and neighbourhood graphs are available.": "권장. 계층·레벨·멤버. 없으면 엔티티 목록과 이웃 그래프만 쓸 수 있습니다.",
  "This link carries a view state; it is restored once the same files are chosen again. Links share the view, never the data.": "이 링크에는 화면 상태가 담겨 있습니다. 같은 파일을 다시 선택하면 복원됩니다. 링크는 화면만 공유하고 데이터는 공유하지 않습니다.",
  "{title} sits inside a closed community, so it is not drawn yet.": "{title}은(는) 닫힌 커뮤니티 안에 있어 아직 그려지지 않았습니다.",
  "{title} is on level {level}, not on the level shown.": "{title}은(는) 레벨 {level}에 있어 지금 보이는 레벨에 없습니다.",
  "Open it here": "여기서 열기",
  "Show level {level}": "레벨 {level} 보기",
  "The communities of this graph as nodes inside their parents": "이 그래프의 커뮤니티들을 부모 안의 노드로 본다",
  "clouds": "구름",
  "boxes": "박스",
  "Leaves of one type on the same hub become one node": "같은 허브에 매달린 같은 유형의 잎 노드를 하나로 묶습니다",
  "{leaves} leaves folded into {bundles} bundles; click a bundle for its members.": "잎 {leaves}개를 묶음 {bundles}개로 접었습니다. 묶음을 클릭하면 멤버가 보입니다.",
  " ({share}% of the links) is hidden by default; click its chip above to show it.": " 관계({share}%)는 기본으로 숨겼습니다. 위의 칩을 누르면 보입니다.",
  "{count} entities of type {type}, each linked to {hub} by {relationship}.": "{type} 유형 엔티티 {count}개. 각각 {relationship} 관계로 {hub}에 연결됩니다.",
  "Hub: {name}": "허브: {name}",
  "Hops": "홉",
  "Back to the community": "커뮤니티로 돌아가기",
  "{shown} of {members} entities within {hops} hops, {internal} relationships, in {communities} communities": "{hops}홉 안의 엔티티 {members}개 중 {shown}개, 관계 {internal}개, 커뮤니티 {communities}개",
  "Explore neighbourhood": "이웃 탐색",
  "Everything within two hops, across communities": "커뮤니티 경계와 무관하게 2홉 안의 모든 것",
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
