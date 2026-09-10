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
  "Try one:":
    "예시:",
  "What is {entity} connected to, and what do those links mean?":
    "{entity} 은(는) 무엇과 연결되어 있고 그 연결은 무엇을 뜻합니까?",
  "How are {entity} and {other} related?":
    "{entity} 와(과) {other} 는 어떤 관계입니까?",
  "What are the main themes across this index?":
    "이 색인 전체를 관통하는 주제는 무엇입니까?",
  "What do {community} and {other} each cover, and how do they connect?":
    "{community} 와(과) {other} 는 각각 무엇을 다루고 서로 어떻게 이어집니까?",
  "Ranks entities against the question, then reads their neighbours and source text.":
    "질문과 가까운 엔티티를 고른 뒤 그 이웃과 원문을 읽습니다.",
  "Two starting points at once: checks that the context keeps both and their shared links.":
    "출발점이 둘입니다. 컨텍스트가 둘과 공통 연결을 모두 담는지 확인합니다.",
  "Reads every community summary at the chosen level; nothing else reaches the model.":
    "선택한 레벨의 커뮤니티 요약만 읽습니다. 그 밖의 것은 모델에 가지 않습니다.",
  "Names two summaries, so a wrong answer points at the summary rather than the retrieval.":
    "요약 두 개를 지목합니다. 답이 틀리면 검색이 아니라 요약을 짚을 수 있습니다.",
  "If {entity} were removed or scaled down, what else would be affected?":
    "{entity} 을(를) 삭제하거나 축소하면 무엇이 영향을 받습니까?",
  "Impact question: the answer is only as good as the relationships the context carried.":
    "영향도 질문입니다. 컨텍스트가 담은 관계만큼만 답이 정확합니다.",
  "What depends on {entity}, and what does {entity} depend on?":
    "무엇이 {entity} 에 의존하고, {entity} 은(는) 무엇에 의존합니까?",
  "Asks for both directions of a link, which a one-sided context answers wrongly.":
    "관계의 양방향을 묻습니다. 한쪽만 담긴 컨텍스트는 틀리게 답합니다.",
  "Drawing the evidence…":
    "근거 그리는 중…",
  "This answer came from community summaries only, so there is no record graph to draw.":
    "이 답변은 커뮤니티 요약만으로 만들어져 그릴 레코드 그래프가 없습니다.",
  "The run carried no relationship between these records.":
    "이 실행은 레코드 사이의 관계를 담지 않았습니다.",
  "{nodes} records and {edges} relationships went into the prompt. Dashed nodes were not ranked; they are the far end of a link. {hover}":
    "레코드 {nodes}개와 관계 {edges}개가 프롬프트에 들어갔습니다. 점선 노드는 순위에 들지 않았고 관계의 반대편일 뿐입니다. {hover}",
  "Zoom in for names": "확대해서 이름 보기",
  "What is {type} {entity} connected to, and what do those links mean?":
    "{type} {entity} 은(는) 무엇과 연결되어 있고 그 연결은 무엇을 뜻합니까?",
  "How are {type} {entity} and {otherType} {other} related?":
    "{type} {entity} 와(과) {otherType} {other} 는 어떤 관계입니까?",
  "If {type} {entity} were removed or scaled down, what else would be affected?":
    "{type} {entity} 을(를) 삭제하거나 축소하면 무엇이 영향을 받습니까?",
  "What depends on {type} {entity}, and what does it depend on?":
    "무엇이 {type} {entity} 에 의존하고, 이것은 무엇에 의존합니까?",
  "The answer cited {cited} of the {retrieved} records that were sent to the model.":
    "모델에 보낸 레코드 {retrieved}개 중 {cited}개를 답변이 인용했습니다.",
  "Cited by the answer":
    "답변이 인용함",
  "Sent to the model":
    "모델에 보냄",
  "Far end of a link":
    "관계의 반대편",
  "Pick a citation, a node or a row to read the record here.":
    "인용·노드·표의 행을 누르면 여기에 레코드가 열립니다.",
  "cited":
    "인용됨",
  "{n} cited":
    "인용 {n}개",
  "Relationship":
    "관계",
  "Claim":
    "클레임",
  "Type":
    "유형",
  "Links in the index":
    "색인의 연결 수",
  "Text sent to the model":
    "모델에 보낸 텍스트",
  "Ends":
    "양 끝",
  "Links this run carried ({count})":
    "이 실행이 담은 관계 ({count})",
  "and {count} more":
    "그 밖에 {count}개",
  "Open the neighbourhood graph":
    "이웃 그래프 열기",
  "Open this community":
    "이 커뮤니티 열기",
  "Close":
    "닫기",
  "Embedding space":
    "임베딩 공간",
  "Projecting {count} vectors of {dim} dimensions…":
    "{dim}차원 벡터 {count}개를 투영하는 중…",
  "Show 2D":
    "2D 로 보기",
  "Show 3D":
    "3D 로 보기",
  "Drag to turn":
    "끌어서 회전",
  "These {axes} axes carry {shown} of what separates the records. The other {hidden} is in directions this picture cannot show.":
    "이 {axes}개 축이 레코드를 갈라놓는 것의 {shown}를 담고 있습니다. 나머지 {hidden}는 이 그림이 보여줄 수 없는 방향에 있습니다.",
  "Distance on screen is not the cosine similarity the search used. Vectors are scaled to unit length and reduced with PCA, so records that overlap here can still be far apart, and the axes carry no business meaning.":
    "화면의 거리는 검색이 쓴 코사인 유사도가 아닙니다. 벡터를 단위 길이로 맞춘 뒤 PCA로 줄인 것이라, 여기서 겹쳐 보이는 레코드도 원래 공간에서는 멀 수 있고 축에는 업무적 의미가 없습니다.",
  "Zoom to the cited":
    "인용된 것에 맞추기",
  "Question similarity":
    "질문과의 유사도",
  "Similarity to the selected":
    "선택한 것과의 유사도",
  "Not in this run":
    "이 실행에 쓰이지 않음",
  "Drag to turn, shift-drag to move, wheel to zoom":
    "끌면 회전, shift+끌면 이동, 휠로 확대",
  "Drag to move, wheel to zoom":
    "끌면 이동, 휠로 확대",
  "Show only this type":
    "이 유형만 보기",
  "Question":
    "질문",
  "Embedded once":
    "임베딩 1회",
  "The question becomes a vector":
    "질문이 벡터가 됩니다",
  "Ranked by cosine":
    "코사인 정렬",
  "Walked out":
    "이웃 확장",
  "Cut to the budget":
    "예산까지 절단",
  "estimated tokens":
    "추정 토큰",
  "Prompt":
    "프롬프트",
  "Model":
    "모델",
  "Answer":
    "답변",
  "records cited":
    "개 레코드 인용",
  "Community summaries":
    "커뮤니티 요약",
  "Batched":
    "배치 분할",
  "Points pulled out":
    "요점 추출",
  "Written once":
    "최종 작성 1회",
  "Show the prompt sent to the model":
    "모델에 보낸 프롬프트 보기",
  "Hide the prompt":
    "프롬프트 접기",
  "{n} messages, {chars} characters":
    "메시지 {n}개 · {chars}자",
  "How a question reaches an answer":
    "질문이 답변에 이르는 경로",
  "Offline, once":
    "오프라인, 한 번",
  "Files in this tab":
    "이 탭이 읽은 파일",
  "This tab":
    "이 탭 안",
  "Your provider":
    "설정한 제공자",
  "embed_index runner":
    "embed_index 러너",
  "Cosine ranking":
    "코사인 정렬",
  "Neighbours and summaries":
    "이웃과 요약",
  "Budget cut":
    "예산 절단",
  "Prompt assembled":
    "프롬프트 조립",
  "Answer and citations":
    "답변과 인용",
  "Embeddings endpoint":
    "임베딩 엔드포인트",
  "Chat endpoint":
    "채팅 엔드포인트",
  "Summaries at the level":
    "그 레벨의 요약",
  "Points kept":
    "남긴 요점",
  "Chat endpoint, once a batch":
    "채팅 엔드포인트, 배치마다 1회",
  "Chat endpoint, once more":
    "채팅 엔드포인트, 마지막 1회",
  "writes":
    "생성",
  "the question text":
    "질문 문장",
  "query vector":
    "질의 벡터",
  "seeds":
    "시드",
  "the selected evidence":
    "선택된 근거",
  "every summary at the level":
    "그 레벨의 요약 전부",
  "scored points":
    "점수 매긴 요점",
  "the surviving points":
    "살아남은 요점",
  "Red arrows are the only things that leave this tab. Everything else happens here.":
    "붉은 화살표만 이 탭을 떠납니다. 나머지는 전부 여기서 일어납니다.",
  "Ranked by the question": "질문이 고른 순서",
  "Cosine": "코사인",
  "cut by the budget": "예산에서 제외",
  "in the prompt": "프롬프트에 포함",
  "the question": "질문",
  "Retrieval":
    "검색",
  "Context window":
    "컨텍스트 창",
  "Model call":
    "모델 호출",
  "Response":
    "응답",
  "Embed the question":
    "질문 임베딩",
  "needs the sidecar":
    "사이드카가 필요합니다",
  "Nearest by cosine":
    "코사인 최근접",
  "Follow the graph":
    "그래프 따라가기",
  "of the communities the seeds belong to":
    "시드가 속한 커뮤니티의 것",
  "Pack the context window":
    "컨텍스트 창 채우기",
  "seeds, then links, summaries, chunks, claims":
    "시드 → 관계 → 요약 → 청크 → 클레임 순",
  "Number every item":
    "항목마다 번호 부여",
  "so a citation can name one":
    "인용이 지목할 수 있도록",
  "System and user message":
    "system·user 메시지",
  "prompt tokens the provider counted":
    "제공자가 센 프롬프트 토큰",
  "One completion":
    "완성 1회",
  "Completion tokens":
    "완성 토큰",
  "what the model wrote back":
    "모델이 써 보낸 양",
  "Read the citations":
    "인용 해석",
  "[Data: Entities (3); Reports (1)] back to records":
    "[Data: Entities (3); Reports (1)] 를 레코드로",
  "[Data: Reports (2)] back to communities":
    "[Data: Reports (2)] 를 커뮤니티로",
  "Every summary at the level":
    "그 레벨의 요약 전부",
  "no ranking: global reads them all":
    "정렬 없음. Global 은 전부 읽습니다",
  "Split into context windows":
    "컨텍스트 창 단위로 분할",
  "One completion a batch":
    "배치마다 완성 1회",
  "pull out scored points, JSON only":
    "점수 매긴 요점 추출, JSON 만",
  "Keep the best points":
    "상위 요점만 남김",
  "by the score the model gave each":
    "모델이 매긴 점수 기준",
  "One completion more":
    "완성 1회 더",
  "what fits":
    "들어간 것",
  "the evidence text":
    "근거 텍스트",
  "every summary":
    "요약 전부",
  "the points that survived":
    "살아남은 요점",
  "Bordered boxes are calls to the model. Red arrows carry text out of this tab; everything else stays here.":
    "테두리가 굵은 상자가 모델 호출입니다. 붉은 화살표가 이 탭 밖으로 텍스트를 보내고, 나머지는 여기 머뭅니다.",
  "over {n} entity vectors": "엔티티 벡터 {n}개 중에서",
  "relationships of the seeds, out of {n}": "시드의 관계. 전체 {n}개 중",
  "{model} · {dim}d": "{model} · {dim}차원",
  "{model} · temperature 0": "{model} · temperature 0",
  "{n} tokens a batch": "배치당 {n} 토큰",
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
  "Global reads every summary at this level ({reports}) in one context window, so this question costs about {calls} model calls.":
    "Global 은 이 레벨의 요약 {reports}건을 한 컨텍스트 창에 담아 읽으므로 이 질문에 모델 호출이 약 {calls}회 듭니다.",
  "Global reads every summary at this level ({reports}) in {batches} context windows, so this question costs about {calls} model calls.":
    "Global 은 이 레벨의 요약 {reports}건을 컨텍스트 창 {batches}개로 나눠 읽으므로 이 질문에 모델 호출이 약 {calls}회 듭니다.",
  "The vectors were made with {stored} and the question would be embedded with {asked}. A ranking is only meaningful when both come from the same model.":
    "벡터는 {stored} 로 만들었는데 질문은 {asked} 로 임베딩됩니다. 두 모델이 같아야 순위에 의미가 있습니다.",
  "See a saved run": "저장된 실행 보기",
  "A run recorded earlier, to read without calling a model": "이전에 기록해 둔 실행입니다. 모델을 호출하지 않고 읽습니다",
  "This index carries a run recorded earlier, so the tab can be read before any provider is set up.":
    "이 색인에는 이전에 기록해 둔 실행이 함께 있어, 제공자를 설정하기 전에도 이 탭을 볼 수 있습니다.",
  // 화면 이름과 안내
  "Views": "화면",
  "Health": "상태",
  "Types": "스키마",
  "Focus": "초점",
  "{n} things to fix": "고칠 것 {n}건",
  "What this index will and will not answer, and the communities in it": "이 색인이 무엇에 답하고 무엇에 답하지 못하는지, 그리고 그 안의 커뮤니티",
  "The entity types, the relationships between them, and the tables behind both": "엔티티 유형과 그 사이의 관계, 그리고 그 둘의 바탕이 되는 테이블",
  "New here? The Ask tab answers a question from this index and links every citation back to the record it came from. This one carries a recorded run, so no API key is needed.":
    "처음이시라면 질문 탭부터 보십시오. 이 색인을 근거로 답하고, 모든 인용을 그 근거 레코드로 되돌려 연결합니다. 이 색인에는 기록해 둔 실행이 들어 있어 API 키가 필요 없습니다.",
  "Show me": "보여주기",
  "Dismiss": "닫기",

  // 색인 진단
  "What this index will and will not answer": "이 색인이 답할 수 있는 것과 없는 것",
  "nothing to fix": "고칠 것 없음",
  "{n} to fix": "고칠 것 {n}건",
  "{n} to keep an eye on": "지켜볼 것 {n}건",
  "Every check below passed. The numbers behind them are in the Quality view.": "아래 검사를 모두 통과했습니다. 근거가 된 수치는 품질 화면에 있습니다.",
  "What looks fine ({n})": "괜찮은 항목 ({n})",
  "global search": "Global 검색",
  "local search": "Local 검색",
  "both searches": "두 검색 모두",
  "evidence": "근거 추적",
  "{count} entities ({share}) belong to no community": "엔티티 {count}건({share})이 어느 커뮤니티에도 속하지 않습니다",
  "Global search reads community summaries and nothing else, so these entities cannot appear in a global answer. Local search still reaches them.":
    "Global 검색은 커뮤니티 요약만 읽으므로 이 엔티티들은 Global 답변에 등장할 수 없습니다. Local 검색으로는 여전히 조회됩니다.",
  "Most of them have no relationship for the clustering to use. Check what extraction produced, or cluster every connected component instead of the largest one.":
    "대개 군집화가 쓸 관계가 없는 엔티티들입니다. 추출 결과를 확인하거나, 가장 큰 성분만이 아니라 모든 연결 성분을 군집화하십시오.",
  "See them under the bands": "밴드 아래에서 보기",
  "{count} entities ({share}) have no relationship": "엔티티 {count}건({share})에 관계가 하나도 없습니다",
  "An entity with no edge carries no neighbourhood, so local search retrieves it on its own and clustering has nothing to place it by.":
    "간선이 없는 엔티티는 인접 관계를 갖지 않으므로 Local 검색이 그것만 단독으로 가져오고, 군집화는 배치 기준을 갖지 못합니다.",
  "Extraction usually produced these from a passing mention. Shorter chunks, or a prompt tuned to this corpus, produce fewer of them.":
    "대개 스쳐 지나가는 언급에서 추출된 것들입니다. 청크를 짧게 하거나 이 말뭉치에 맞춘 프롬프트를 쓰면 줄어듭니다.",
  "Show them on the graph": "그래프에서 보기",
  "One community holds {size} of the {covered} entities at L{level}": "L{level} 의 엔티티 {covered}건 중 {size}건을 커뮤니티 하나가 갖고 있습니다",
  "A summary that stands for {share} of a level has to describe everything, so global search cites it whatever it was asked.":
    "레벨의 {share}를 대표하는 요약은 모든 것을 서술해야 하므로, Global 검색은 무엇을 묻든 이 요약을 인용하게 됩니다.",
  "Lower max_cluster_size, or raise the Leiden resolution, and cluster again. The Formation view runs it here first.":
    "max_cluster_size 를 낮추거나 Leiden 해상도를 올려 다시 군집화하십시오. 형성 과정 화면에서 먼저 시험해 볼 수 있습니다.",
  "Compare the levels": "레벨 비교하기",
  "{count} of {total} communities have no summary": "커뮤니티 {total}개 중 {count}개에 요약이 없습니다",
  "Global search reads summaries and nothing else, so a community without one is not read at all.":
    "Global 검색은 요약만 읽으므로, 요약이 없는 커뮤니티는 아예 읽히지 않습니다.",
  "tools/summarize_communities.py writes a summary file for a community set that has none.":
    "요약이 없는 커뮤니티 집합에는 tools/summarize_communities.py 가 요약 파일을 만들어 줍니다.",
  "Sort by report": "보고서 기준 정렬",
  "Modularity is {reading}, and the highest is below {floor}": "모듈성이 {reading} 이며, 가장 높은 값도 {floor} 미만입니다",
  "Modularity compares the relationships inside communities against a random rewiring. This low, the communities cut across the graph rather than following it, and their summaries group entities that are not related.":
    "모듈성은 커뮤니티 내부 관계를 무작위 재배선과 대조한 값입니다. 이 정도로 낮으면 커뮤니티가 그래프를 따르지 않고 가로지르고 있으며, 그 요약은 서로 무관한 엔티티를 한데 묶습니다.",
  "The graph may have too few relationships to cluster at all. Check the relationship count against the entity count before trusting any global answer.":
    "관계 수가 군집화에 필요한 만큼도 되지 않을 수 있습니다. Global 답변을 신뢰하기 전에 엔티티 수 대비 관계 수를 확인하십시오.",
  "See it per level": "레벨별로 보기",
  "Modularity is {reading}": "모듈성이 {reading} 입니다",
  "Above {floor} the communities follow the graph rather than cutting across it, so their summaries are about something.":
    "{floor} 를 넘으면 커뮤니티가 그래프를 가로지르지 않고 따라가므로, 요약이 실제 내용을 담습니다.",
  "{share} of entities have almost no description": "엔티티의 {share}에 설명이 거의 없습니다",
  "Local search ranks by cosine between the question and the entity's title and description. An entity with a bare title ranks close to nothing in particular.":
    "Local 검색은 질문과 엔티티의 제목·설명 사이 코사인으로 순위를 매깁니다. 제목만 있는 엔티티는 어떤 질문에도 특별히 가깝지 않습니다.",
  "Description quality comes from the extraction and summarization prompts. graphrag prompt-tune writes ones fitted to the corpus.":
    "설명의 품질은 추출·요약 프롬프트에서 나옵니다. graphrag prompt-tune 이 말뭉치에 맞춘 프롬프트를 만들어 줍니다.",
  "Look at the entities": "엔티티 살펴보기",
  "{share} of relationships carry no description": "관계의 {share}에 설명이 없습니다",
  "The description is what a relationship contributes to a prompt. Without one the model is told that two entities are connected and nothing about how.":
    "관계가 프롬프트에 기여하는 것은 설명입니다. 설명이 없으면 모델은 두 엔티티가 연결되어 있다는 사실만 받고 어떻게 연결되는지는 받지 못합니다.",
  "Exports from a property graph often drop the description. Carry it across if the source has one.":
    "속성 그래프에서 내보낼 때 설명이 누락되는 경우가 많습니다. 원천에 설명이 있으면 함께 옮기십시오.",
  "{title} touches {share} of all relationships": "{title} 이(가) 전체 관계의 {share}에 닿아 있습니다",
  "Clustering pulls everything towards a node like this, and a picture of it is a star rather than a graph. The views fold its spokes away; a global summary cannot.":
    "이런 노드가 있으면 군집화가 모든 것을 그쪽으로 끌어당기고, 그림도 그래프가 아니라 별 모양이 됩니다. 화면은 뻗은 가지를 접어 두지만 Global 요약은 그럴 수 없습니다.",
  "Open it": "열어 보기",
  "This index shipped no source text": "이 색인에는 원문이 함께 오지 않았습니다",
  "Without text_units.parquet a citation stops at the record. You can see which entity an answer used, but not the sentence it was drawn from.":
    "text_units.parquet 이 없으면 인용이 레코드에서 멈춥니다. 답변이 어떤 엔티티를 썼는지는 보이지만, 그것이 어느 문장에서 나왔는지는 볼 수 없습니다.",
  "Load text_units.parquet and documents.parquet alongside the index if the run wrote them.":
    "색인 실행이 만들었다면 text_units.parquet 과 documents.parquet 을 함께 적재하십시오.",
  "{count} source chunks are loaded": "원문 청크 {count}건이 적재되어 있습니다",
  "A citation can be followed past the record to the text it came from.": "인용을 레코드 너머 원문까지 따라갈 수 있습니다.",
  "No entity vectors, so local search is off": "엔티티 벡터가 없어 Local 검색이 꺼져 있습니다",
  "GraphRAG writes entity embeddings to a vector store rather than to Parquet, and a browser cannot read one. Global search does not need them.":
    "GraphRAG 는 엔티티 임베딩을 Parquet 이 아니라 벡터 저장소에 쓰는데, 브라우저는 그 형식을 읽지 못합니다. Global 검색에는 필요하지 않습니다.",
  "tools/embed_index writes an embeddings.parquet sidecar next to the index.": "tools/embed_index 가 색인 옆에 embeddings.parquet 사이드카를 만들어 줍니다.",
  "Open the Ask tab": "질문 탭 열기",

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
  "Read this community": "이 커뮤니티 읽기",
  "Wheel": "휠",
  "zoom": "확대·축소",
  "Drag": "끌기",
  "move": "이동",
  "Zoom in": "확대",
  "more names appear": "이름이 더 뜸",
  "Drag a cloud": "구름 끌기",
  "pull a community aside": "커뮤니티를 떼어 놓음",
  "Click a cloud": "구름 클릭",
  "read it; double-click opens its own graph": "요약을 읽음. 더블클릭하면 내부 그래프",
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
  "free, communities held together": "자유, 커뮤니티는 뭉쳐서",
  "one blob per community, in rows": "커뮤니티마다 한 덩어리, 줄지어",
  "one blob per community": "커뮤니티마다 한 덩어리",
  "{groups} communities, each packed into its own blob with a gap around it. {loose} records belong to none.": "커뮤니티 {groups}개를 각각 한 덩어리로 묶고 사이를 띄웠습니다. 어디에도 속하지 않은 레코드는 {loose}개입니다.",
  "Click a record to centre on it.": "레코드를 누르면 그 레코드가 가운데로 옵니다.",
  "Show entities in no community": "커뮤니티에 없는 엔티티 보기",
  "{n} entities are in no community": "커뮤니티에 없는 엔티티 {n}개",
  "View": "보기",
  "all communities by level": "레벨별 커뮤니티 전체",
  "nested boxes with members": "멤버가 든 중첩 상자",
  "{communities} communities on {levels} levels. A band is a level, a circle is a community sized by how many entities it holds, and a curve joins a community to its parent.": "커뮤니티 {communities}개, 레벨 {levels}단. 가로 띠가 레벨이고, 원 하나가 커뮤니티이며 크기는 담고 있는 엔티티 수입니다. 곡선은 부모와 자식을 잇습니다.",
  "Click a circle to read it; double-click to open its internal graph.": "원을 누르면 내용을 읽고, 두 번 누르면 내부 그래프가 열립니다.",
  "L{depth} · {communities} communities · {entities} entities": "L{depth} · 커뮤니티 {communities}개 · 엔티티 {entities}개",
  "Laying out {n} nodes…": "노드 {n}개 배치 중…",
  "Opening a type names its two busiest records and counts the rest; click the bubble to open them.": "유형을 열면 연결이 많은 레코드 2개만 이름을 달고 나머지는 개수로 접힙니다. 묶음을 누르면 펼쳐집니다.",
  "Opening a type draws its busiest records.": "유형을 열면 연결이 많은 레코드부터 그립니다.",
  "The busiest are kept; switch to all of the data to see the rest.": "연결이 많은 쪽을 남깁니다. 나머지는 전체 데이터로 바꾸면 보입니다.",
  "The outer ring is what those neighbours reach in turn.": "바깥 고리는 그 이웃들이 다시 닿는 것입니다.",
  "part of the data": "데이터 일부",
  "all of the data ({n} entities)": "전체 데이터 (엔티티 {n}개)",
  "At most": "최대",
  "{n} entities": "엔티티 {n}개",
  "Whole:": "전체:",
  "Part:": "일부:",
  "Opening a type draws every record it has.": "유형을 열면 가진 레코드를 모두 그립니다.",
  "Opening a type draws its busiest {n} records.": "유형을 열면 연결이 많은 레코드 {n}개를 그립니다.",
  "The busiest are kept; switch to all of the data or raise the limit to see more.": "연결이 많은 쪽을 남깁니다. 전체 데이터로 바꾸거나 상한을 올리면 더 보입니다.",
  "one record at the centre": "레코드 하나를 가운데로",
  "centred on {title}": "중심: {title}",
  "Back to the schema": "스키마로 돌아가기",
  "a few of each kind": "종류마다 대표만",
  "all of the data": "전체 데이터",
  "{title} has {neighbours} neighbours over {relationships} relationships, in {groups} kinds.": "{title}은(는) 관계 {relationships}개로 이웃 {neighbours}개와 이어져 있고, 종류는 {groups}가지입니다.",
  "A few of each kind are named; click a dashed bubble to open the rest, or switch to all of the data.": "종류마다 대표만 이름을 답니다. 점선 묶음을 누르면 나머지가 펼쳐지고, 전체 데이터로 바꿔도 됩니다.",
  "Everything it touches is drawn.": "닿는 것을 모두 그렸습니다.",
  "Click a record to move the centre there.": "레코드를 누르면 중심이 그쪽으로 옮겨 갑니다.",
  "{rows} of {rowsTotal} {from} by {cols} of {colsTotal} {to}. {pairs} of {possible} cells are filled: {breakdown}.": "{from} {rowsTotal}개 중 {rows}개 × {to} {colsTotal}개 중 {cols}개. 칸 {possible}개 가운데 {pairs}개가 찼습니다: {breakdown}.",
  "Matrix": "행렬",
  "Two entity types as a grid, which is the readable form of a dense block": "두 유형을 격자로. 촘촘한 덩어리는 이 형태라야 읽힙니다",
  "Cross": "교차",
  "Filter rows": "행 거르기",
  "no relationship": "관계 없음",
  "Hover a cell to read the pair; click a row to open the record.": "칸에 마우스를 올리면 짝을 읽고, 행을 누르면 레코드가 열립니다.",
  "{rows} of {rowsTotal} {from} by {cols} of {colsTotal} {to}; {pairs} pairs connected out of {possible}.": "{from} {rowsTotal}개 중 {rows}개 × {to} {colsTotal}개 중 {cols}개. 그린 칸 {possible}개 가운데 {pairs}개가 이어져 있습니다.",
  "Find a record": "레코드 찾기",
  "Open the neighbourhood of one record": "레코드 하나의 이웃 열기",
  "{percent} of the possible pairs are connected": "가능한 짝의 {percent}가 이어져 있습니다",
  "Too dense to draw as arrows. See it as a grid.": "화살표로 그리기엔 너무 촘촘합니다. 격자로 보세요.",
  "See as a grid": "격자로 보기",
  "Where they hang": "어디에 매달려 있나",
  "{n} distinct {side}, {fan} each on average": "{side} {n}개, 평균 {fan}개씩",
  "targets": "도착",
  "sources": "출발",
  "Open the neighbourhood": "이웃 열기",
  "No communities.parquet was loaded. Find an entity in the Network view and open its neighbourhood; the map and quality views need communities.": "communities.parquet 가 없습니다. 전체 그래프에서 엔티티를 찾아 이웃을 열어 보세요. 지도와 품질 화면은 커뮤니티가 있어야 합니다.",
  "No community set is loaded. Pick an entity in the graph to read it and explore its neighbourhood.": "커뮤니티 집합이 없습니다. 그래프에서 엔티티를 고르면 상세와 이웃 탐색을 쓸 수 있습니다.",
  "{types} types drawn; {open} opened into {records} records, {edges} relationships.": "유형 {types}개를 그렸습니다. 열린 것: {open}, 레코드 {records}개, 관계 {edges}개.",
  "Click a type to open or close it.": "유형을 누르면 열리고 다시 누르면 닫힙니다.",
  "none": "없음",
  "schema, open a type to see its records": "스키마, 유형을 열면 레코드가 나옵니다",
  "Each type is one node until you click it open. {open} open now.": "각 유형은 눌러서 열기 전까지 노드 하나입니다. 지금 열린 것: {open}.",
  "None": "없음",
  "Draw this type and everything it touches": "이 유형과 닿는 것을 모두 그리기",
  "Follow": "따라가기",
  "Add this relationship and the type at its other end": "이 관계와 반대편 유형을 더하기",
  "Nobody has joined anyone yet: every entity is still on its own.": "아직 아무도 합쳐지지 않았습니다. 모든 엔티티가 혼자입니다.",
  "Types and how they connect": "타입과 연결 방식",
  "The schema of this index, counted from the rows themselves: one node per entity type, one arrow per relationship that occurs between two types.": "행에서 직접 센 이 인덱스의 스키마입니다. 엔티티 유형마다 노드 하나, 두 유형 사이에 실제로 나타난 관계마다 화살표 하나입니다.",
  "{types} entity types, {triples} kinds of relationship between them": "엔티티 유형 {types}종, 그 사이 관계 조합 {triples}종",
  "Nothing declares this shape; it is counted from the rows. Click a type or an arrow to see the records behind it.": "이 모양을 선언한 곳은 없고 행에서 센 것입니다. 타입이나 화살표를 누르면 뒤에 있는 실제 레코드가 보입니다.",
  "{n} relationships point at an entity the table does not have, so they are in no triple.": "관계 {n}개가 엔티티 테이블에 없는 대상을 가리켜 어느 조합에도 들어가지 않았습니다.",
  "{entities} entities, {relationships} relationships touching them.": "엔티티 {entities}개, 이들에 닿는 관계 {relationships}개.",
  "Show these records in the graph": "이 레코드를 그래프에서 보기",
  "Busiest records": "연결이 많은 레코드",
  "Records": "레코드",
  "{n} relationships of this shape.": "이 모양의 관계 {n}개.",
  "from the schema: {label}": "스키마에서: {label}",
  "Show the whole graph again": "전체 그래프로 되돌리기",
  "the schema selection ({label})": "스키마 선택 ({label})",
  "Communities at this step": "이 단계의 커뮤니티",
  "entities": "엔티티",
  "and {n} more": "외 {n}개",
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
  "Click a node to light up two hops around it, double-click to draw it on its own. A community reads its summary; the background clears.":
    "노드를 누르면 주변 2홉이 살아나고, 두 번 누르면 그 노드만 따로 그립니다. 커뮤니티를 누르면 요약, 배경을 누르면 해제됩니다.",
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
