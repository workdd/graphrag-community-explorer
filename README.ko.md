# GraphRAG Community Explorer

[English](README.md) · **한국어**

**[Microsoft GraphRAG](https://github.com/microsoft/graphrag) 색인을 브라우저에서 열고, 질문하고,
그 답변이 실제로 사용한 레코드까지 되짚습니다.** 서버도 설치도 없고, 파일은 어디에도 올라가지 않습니다.

[![라이브 데모](https://img.shields.io/badge/demo-live-1f6feb)](https://workdd.github.io/graphrag-community-explorer/)
[![라이선스 MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![백엔드 없음](https://img.shields.io/badge/backend-none-black)](#사용-방법)
[![GraphRAG 0.3~2.x](https://img.shields.io/badge/GraphRAG-0.3%20to%202.x-black)](#읽는-파일)

![표본 색인을 스키마로 열고, 전체 그래프를 커뮤니티 구름과 함께 그린 뒤, 질문한 답변의 인용 하나를 눌러 해당 레코드와 근거 그래프까지 따라가는 화면](docs/screenshots/ask.gif)

**[데모 열기](https://workdd.github.io/graphrag-community-explorer/) → 질문 → 저장된 실행 보기.**
API 키가 필요 없습니다. 표본에 실행 기록 하나가 들어 있어, 답변에서 근거까지 가는 경로 전체를 클릭 한 번으로
볼 수 있습니다.

## 그래프 뷰어와 무엇이 다릅니까

그래프 뷰어는 노드를 그립니다. 이 도구는 GraphRAG 가 노드를 실제로 어떻게 조직하는지를 그리고, 검색이 그것을
가지고 무엇을 하는지까지 보여줍니다.

- **노드가 뒤엉킨 그림이 아니라 커뮤니티가 먼저입니다.** 색인은 자기 스키마와 커뮤니티 계층으로 열립니다.
  GraphRAG 가 만들어 내는 것이 그것이고, 그것을 보여주는 도구가 없었기 때문입니다.
- **검증할 수 있는 답변입니다.** 모든 인용이 버튼이고, 누르면 그 레코드가 프롬프트에 들어간 문장 그대로
  열립니다. 검색되었지만 인용되지 않은 레코드도 화면에 남습니다. 모델이 무시한 것이 사용한 것만큼 잘 보입니다.
- **파이프라인이 화면에 있습니다.** 검색, 토큰 예산, 모델 호출별 실측 소요 시간, 그리고 전송된 프롬프트 원문.
  Local 과 Global 두 방식 모두 GraphRAG 의 방법을 따릅니다.
- **별도로 기동할 서버가 없습니다.** Parquet 폴더 하나와 브라우저 탭 하나면 됩니다. 공식
  `unified-search-app` 은 Python, Streamlit, 버전이 고정된 GraphRAG 설치를 요구합니다.

상태: 0.3, 알파. 적재기, 스키마 화면, 전체 그래프 화면, 커뮤니티 계층과 지도, 보고서 인스펙터, 무결성 검사,
품질 지표, 커뮤니티 집합 비교, 원문 근거, 그리고 질문 탭(직접 설정한 제공자로 Local·Global 검색)이 동작합니다.
이후 계획은 [docs/ROADMAP.md](docs/ROADMAP.md) 에 있습니다.

## 사용 방법

```sh
npm install
npm run dev          # http://127.0.0.1:5173
```

**Open the sample dataset** 를 누르거나, GraphRAG `output/` 폴더를 화면에 끌어다 놓습니다. 상단의
**한국어** 버튼으로 화면 언어를 바꿉니다.

표본으로 도는 라이브 데모: https://workdd.github.io/graphrag-community-explorer/

자기 색인을 매일 쓰려면 파일을 `local-data/<이름>/` 에 두고 `http://127.0.0.1:5173/?data=./data/<이름>`
으로 엽니다. 이 폴더는 Git 이 무시하고 빌드에도 들어가지 않습니다. `.env.example` 을 `.env.development.local`
로 복사하고 `VITE_DEFAULT_DATA=./data/<이름>` 을 적으면 시작할 때 바로 열립니다. HTTP 로 서빙되는 폴더라면
어디든 `?data=<주소>` 로 같은 방식이 됩니다.

개발 서버 없이, 빌드한 사본과 색인 폴더를 함께 서빙하려면 다음과 같이 합니다.

```sh
npm run build
npm run serve -- --data ~/graphrag/output     # http://127.0.0.1:4180/?data=./data/output
```

npm 에 배포된 뒤에는 내려받지 않고 같은 서버를 띄울 수 있습니다.

```sh
npx graphrag-community-explorer --data ~/graphrag/output
```

`Dockerfile` 은 nginx 가 서빙하는 정적 이미지를 만듭니다. 색인 폴더를
`/usr/share/nginx/html/data/<이름>` 에 마운트하고 `?data=./data/<이름>` 으로 엽니다. Docker 가 설치된
환경에서 아직 검증하지 않았습니다.

## 질문하기

**질문** 탭은 열려 있는 색인을 근거로 답하며, 모델 제공자는 직접 설정합니다. GraphRAG 의 두 검색 방식을
따르되 선택과 예산 배분은 이 프로젝트의 것이므로, 같은 색인에 `graphrag query` 를 돌린 결과와 반드시
일치하지는 않습니다.

- **Local** 은 질문을 임베딩해 엔티티 벡터와 코사인으로 순위를 매기고, 상위 엔티티와 그들 사이의 관계,
  그들이 속한 커뮤니티의 보고서, 그 뒤의 원문 청크, 그들에 대한 주장을 이 우선순위대로 토큰 예산에 담습니다.
  색인 옆에 `embeddings.parquet` 이 필요합니다.
- **Global** 은 커뮤니티 보고서를 읽어 컨텍스트 창 단위로 나누고, 창마다 점수가 매겨진 요점을 모델에게
  받은 뒤, 상위 요점만 남겨 한 번 더 호출해 답을 씁니다. `community_reports.parquet` 이 필요하고 임베딩은
  쓰지 않습니다. GraphRAG 의 Global 검색도 같은 방식입니다.

무엇을 설정하기 전에, 이전에 기록해 둔 실행을 먼저 읽을 수 있습니다. 함께 배포하는 표본에 하나가 들어 있고,
탭이 **저장된 실행 보기** 로 제안합니다. 실제 답변과 인용, 근거 그래프, 검색되었지만 인용되지 않은 레코드까지
지금 열려 있는 색인에 그대로 연결됩니다. 자기 색인 폴더에 `example-run.json` 을 두면 같은 동작을 하며,
그 파일은 **이 실행 저장** 이 만들어 줍니다.

OpenAI 호환 엔드포인트면 무엇이든 됩니다. 키는 브라우저의 로컬 저장소에만 있고, 저장된 실행이나 로그에는
들어가지 않습니다. Upstage 와 OpenAI 프리셋이 두 모델 이름을 채워 줍니다. 임베딩 모델이 중요합니다. 사이드카를
만든 모델과 다른 모델로 질문을 임베딩하면 순위에 의미가 없어지고, 다르면 화면이 그 사실을 알려 줍니다.

브라우저마다 설정을 다시 입력하지 않으려면 `.env.example` 을 `.env.development.local` 로 복사해
`VITE_LLM_BASE_URL`, `VITE_LLM_CHAT_MODEL`, `VITE_LLM_EMBED_MODEL` 을 적습니다. `VITE_LLM_API_KEY` 도
넣을 수 있지만 결과를 감수해야 합니다. Vite 는 이 값들을 번들에 그대로 넣기 때문에, `ALLOW_EMBEDDED_KEY=1`
로 명시하지 않는 한 `npm run build` 가 키가 포함된 빌드를 거부합니다. 화면에서 입력한 값이 환경 변수보다
우선합니다.

Local 검색에는 엔티티 벡터가 필요한데, GraphRAG 는 이를 Parquet 이 아니라 벡터 저장소에 씁니다.
`tools/embed_index` 가 브라우저가 읽을 수 있는 사이드카를 만듭니다.

```sh
EMBED_API_KEY=… python3 tools/embed_index/embed_index.py --index ~/graphrag/output
```

색인 옆에 `embeddings.parquet` 을 씁니다. 엔티티당 한 행, 벡터는 고정 길이 이진값이며, 파일 메타데이터에
모델·차원·모든 원본 파일의 SHA-256 이 들어갑니다. 사이드카가 다른 색인에서 만들어졌으면 앱이 이 지문을 대조해
어느 파일이 달라졌는지 밝히고 Local 검색을 끕니다.

돌아온 답은 믿는 것이 아니라 확인하는 것입니다.

- 답변의 모든 인용이 버튼입니다. 누르면 그 레코드가 답변 옆에서 열리며, 프롬프트에 들어간 문장, 이 실행이
  가지고 간 관계, 그 뒤의 원문을 함께 보여줍니다.
- 근거 그래프는 모델에 보낸 레코드를 그리고, 답변이 실제로 인용한 것에 빨간 테두리를 칩니다. 노드와 인용과
  표의 행은 같은 레코드를 세 방향에서 본 것이며, 어느 쪽을 눌러도 그 자리에서 열립니다. 다른 탭으로 넘어가지
  않습니다.
- 그래프 아래 표는 검색된 것 전부를 점수와 함께 나열합니다. 모델에게 주어졌지만 쓰이지 않은 레코드가 쓰인
  레코드만큼 잘 보입니다.
- 임베딩 공간은 질문과 엔티티 벡터를 PCA 로 축소해 2차원 또는 3차원에 놓고, 프롬프트에 들어간 것과 예산이
  잘라낸 것을 구분해 표시합니다. 화면의 거리가 검색이 쓴 코사인이 아니라는 사실도 화면에 적혀 있습니다.
- **질문이 답변에 이르는 경로** 는 실행 자체를 그립니다. 검색, 컨텍스트 창, 모델 호출, 응답을 이 실행이 실제로
  쓴 건수와 밀리초와 함께 놓고, 브라우저 밖으로 나간 호출에 빨간 테두리를 칩니다. **모델에 보낸 프롬프트 보기**
  는 전송된 메시지를 그대로 출력합니다.
- **이 실행 저장** 은 추적 파일을 씁니다. 질문, 키를 뺀 설정, 모든 컨텍스트 레코드, 답변, 소요 시간이 들어
  갑니다. **실행 불러오기** 로 다시 읽으면 인용이 다시 연결되므로, 키가 없는 컴퓨터에서도 실행을 검토할 수
  있습니다.

예시 질문은 데이터에서 뽑아 제안합니다. 실제로 도달 가능한 엔티티를, 스키마 유형과 함께 이름 붙여 제시하며,
영향도 질문을 던지기 좋은 종류의 레코드에 가중치를 둡니다.

## 읽는 파일

| 파일 | 용도 |
| --- | --- |
| `entities.parquet` | 엔티티 제목·유형·설명. 필수 |
| `relationships.parquet` | 엔티티 제목 사이의 간선. 필수 |
| `communities.parquet` | 레벨·부모·구성원. 권장. 없으면 엔티티 목록과 인접 그래프만 쓸 수 있습니다 (`public/samples/minimal` 이 그런 집합입니다) |
| `community_reports.parquet` | 요약·발견·순위. Global 검색이 읽습니다 |
| `text_units.parquet`, `documents.parquet` | 원문 청크와 문서. 인스펙터가 엔티티·관계·커뮤니티 뒤의 텍스트를 보여줍니다 |
| `covariates.parquet` | 엔티티에 대한 주장. 엔티티 패널에 나열되고 Local 검색에도 쓰입니다 |
| `embeddings.parquet` | 선택. `tools/embed_index` 가 만드는 엔티티 벡터 사이드카입니다. Local 검색과 임베딩 공간에만 필요합니다 |
| `example-run.json` | 선택. 저장해 둔 실행입니다. 폴더에 있으면 질문 탭이 클릭 한 번으로 제안하므로, 제공자를 설정하기 전에도 탭을 읽을 수 있습니다 |
| `<라벨>_communities.parquet` | 추가 커뮤니티 집합(예: `leiden_communities.parquet`)이며 전환 가능한 파티션이 됩니다 |

레벨은 루트에서 내려가는 순서로 표시합니다. 루트가 L0 이고 자식으로 갈수록 숫자가 커지는 GraphRAG 자신의
번호 체계입니다. 루트에 가장 큰 번호를 매기는 파일(Apache AGE 자원 계층)이나 1부터 시작하는 파일은 표시용으로만
번호를 다시 매기고, 파일 자체의 번호는 툴팁과 트리 아래 안내에 남겨 둡니다.

여러 폴더를 한 번에 제시할 수 있습니다. `npm run serve -- --data a --data b` 와 개발 서버는 모두
`data/index.json` 을 발행하고, 앱은 이를 적재 화면의 버튼과 상단 선택기로 바꿉니다. 폴더의 `manifest.json`
에 `"label"` 을 넣으면 그 이름으로 표시됩니다.

GraphRAG 0.3 부터 2.x 까지의 파일 이름을 인식하며 `create_final_` 접두사도 포함합니다. 오래된 산출물에
`entity_ids` 열이 없으면 `relationship_ids` 로 구성원을 유추하고 무결성 패널이 그 사실을 밝힙니다
(`public/samples/legacy` 가 그런 집합입니다). 같은 배치를 따르는 Apache AGE 내보내기도 적재됩니다.

규모: 엔티티 9,211개, 관계 23,810개, 커뮤니티 1,537개인 합성 색인이 노트북에서 1초 안에 열립니다. 접힌
지도, 품질 화면, 85개 엔티티짜리 커뮤니티 그래프는 각각 0.5초 정도 걸립니다
(`samples/generate_sample.py --scale 53 --edge-factor 5`).

## 화면 구성

영어 README 의 [What you see](README.md#what-you-see) 절에 각 화면의 동작이 자세히 적혀 있습니다. 요약하면
다음과 같습니다.

- **스키마**: 엔티티 유형 하나당 노드 하나, 두 유형 사이에 실제로 존재하는 관계마다 화살표 하나. 이 형태를
  선언하는 곳은 없고 행에서 세어 만듭니다. 아래에는 Parquet 테이블과 키·참조 열이 함께 나옵니다.
- **전체 그래프**: 모든 엔티티와 관계를 한 캔버스에. 색은 유형, 크기는 연결 수입니다. 커뮤니티는 켜고 끄는
  오버레이이며 구름으로도 노드 색으로도 표시됩니다. 이름은 자리가 나는 만큼 나타나고, 확대하면 더 나옵니다.
- **커뮤니티**: 레벨마다 띠 하나, 커뮤니티마다 원 하나, 부모로 이어지는 곡선. 어느 커뮤니티에도 속하지 않은
  엔티티는 회색 점으로 따로 표시하며 끌 수 있습니다.
- **품질**: 레벨별 모듈성과 커버리지, 크기 분포, 커뮤니티별 밀도와 컨덕턴스, 두 커뮤니티 집합의 비교
  (NMI, ARI, 교차표).
- **형성 과정**: 화면에 있는 엔티티로 브라우저에서 Leiden 을 돌려 커뮤니티가 만들어지는 과정을 재생합니다.
  해상도·시드·범위는 바꿀 수 있고, 적재된 커뮤니티는 바뀌지 않습니다.
- **행렬·개요·그래프**: 밀집한 유형 쌍을 격자로, 색인 전체를 한 문단과 정렬 가능한 표로, 선택한 커뮤니티를
  그 자체의 그래프로 봅니다.

화면 언어는 영어와 한국어를 지원하며, 선택은 브라우저에 기억됩니다.

## 개발

```sh
npm run typecheck
npm test             # vitest: 적재기, 계층, 지표, 지도 모델, 근거, 검색
npm run e2e          # 프로덕션 빌드 대상 Playwright 스모크 테스트 (설치된 Chrome 사용)
npm run build        # vite 빌드 후 scripts/check-dist.mjs 가 표본 외 데이터를 거부
npm run hooks        # 클론마다 한 번, pre-push 검사 설치
uv run samples/generate_sample.py   # 합성 표본 재생성
```

검사 두 가지가 실데이터와 자격 증명을 공개 밖으로 내보내지 않습니다. `scripts/check-sensitive.sh` 는 CI 에서
돌고, `npm run hooks` 로 훅을 설치하면 푸시 전에도 돕니다. `public/samples/` 밖의 데이터 파일, 환경 파일,
비공개 내보내기에만 나타나는 식별자를 거부합니다. `scripts/check-dist.mjs` 는 빌드 후에 돌면서 `dist/` 가
표본 외의 것이나 환경에서 인라인된 API 키를 발행하려 하면 실패시킵니다. 실제 색인은 `local-data/` 에 두며,
Git 이 무시하고 빌드가 복사하지 않습니다.

오프라인 도구는 `tools/` 에 있습니다. 엔티티 임베딩 사이드카(`embed_index`), Apache AGE Parquet 내보내기,
Leiden 재클러스터링, 재클러스터링한 집합의 커뮤니티 요약, 커뮤니티 집합 비교입니다. 각각의 설명은
[tools/README.md](tools/README.md) 에 있습니다.

작업 방식은 [CONTRIBUTING.md](CONTRIBUTING.md), 릴리스 내역은 [CHANGELOG.md](CHANGELOG.md) 를 봅니다.

## 라이선스

MIT. 이 프로젝트는 [GraphRAG Visualizer](https://github.com/noworneverev/graphrag-visualizer) 의
포크로 시작했습니다. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 를 참고하십시오. 포크한 코드는
`legacy-prototype` 브랜치에 있으며 현재 애플리케이션은 사용하지 않습니다.
