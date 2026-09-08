# embed_index

GraphRAG 색인의 엔티티 임베딩을 `embeddings.parquet` 한 개로 내보냅니다. Explorer 의 Local 검색이 이 파일을 씁니다.

GraphRAG 는 벡터를 lancedb 같은 별도 저장소에 씁니다. 브라우저는 그 형식을 읽지 못하므로 사이드카가 필요합니다. 이 스크립트는 배포물에 포함되지 않습니다.

## 사용

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 계획만 확인. 제공자를 부르지 않습니다
.venv/bin/python embed_index.py --index ../../local-data/age --check

# 실제 생성
export EMBED_BASE_URL=https://api.upstage.ai/v1
export EMBED_MODEL=solar-embedding-1-large-passage
export EMBED_API_KEY=...
.venv/bin/python embed_index.py --index ../../local-data/age
```

만들어진 `embeddings.parquet` 을 색인 Parquet 과 함께 Explorer 에 놓으면 Local 검색이 켜집니다.

## 제공자 전환

`examples/` 의 env 파일을 복사해 값만 바꿉니다. OpenAI 호환 엔드포인트면 무엇이든 동작합니다.

**Upstage 는 저장용과 질문용 모델이 다릅니다.** 파일은 `solar-embedding-1-large-passage` 로 만들고, Explorer 화면의 임베딩 모델 칸에는 `solar-embedding-1-large-query` 를 넣습니다. 반대로 넣으면 유사도가 어긋납니다.

## 파일 형식

| 컬럼 | 타입 | 내용 |
| --- | --- | --- |
| `id` | 문자열 | `entities.parquet` 의 id |
| `vector` | 바이트 | float32 리틀엔디언 |

파일 수준 메타데이터에 `model`, `dim`, `source_files` 가 들어갑니다. `source_files` 는 색인 Parquet 파일별 SHA-256 이며, Explorer 가 이 값으로 임베딩이 현재 색인의 것인지 판정합니다.

## 테스트

```bash
python3 -m unittest discover -s . -q
```

제공자를 부르지 않습니다.
