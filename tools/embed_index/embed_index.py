#!/usr/bin/env python3
"""GraphRAG 색인의 엔티티 임베딩을 embeddings.parquet 한 개로 내보냅니다.

GraphRAG 는 벡터를 lancedb 같은 별도 저장소에 씁니다. 브라우저는 그 형식을 읽지
못하므로, Explorer 의 Local 검색이 쓸 수 있도록 Parquet 옆에 사이드카를 만듭니다.

    python3 embed_index.py --index ../../local-data/age
    python3 embed_index.py --index <경로> --check      # 호출 없이 계획만 출력

제공자는 OpenAI 호환 엔드포인트면 무엇이든 됩니다. 환경변수로 지정합니다.

    EMBED_BASE_URL   기본값 https://api.upstage.ai/v1
    EMBED_MODEL      기본값 solar-embedding-1-large-passage
    EMBED_API_KEY    필수
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import time
from pathlib import Path
from typing import Callable, Iterable, Iterator, Sequence

DEFAULT_BASE_URL = "https://api.upstage.ai/v1"
DEFAULT_MODEL = "solar-embedding-1-large-passage"
BATCH = 64
TIMEOUT = 60.0

ENTITY_FILES = ("entities.parquet", "create_final_entities.parquet")
FINGERPRINT_FILES = (
    "entities.parquet",
    "create_final_entities.parquet",
    "relationships.parquet",
    "create_final_relationships.parquet",
    "communities.parquet",
    "create_final_communities.parquet",
    "community_reports.parquet",
    "create_final_community_reports.parquet",
    "text_units.parquet",
    "create_final_text_units.parquet",
)


def card(title: str, description: str) -> str:
    """임베딩에 넣을 문자열. 저장할 때와 질문할 때가 같은 규칙이어야 합니다."""
    title = (title or "").strip()
    description = (description or "").strip()
    return f"{title}: {description}" if description else title


def pack(vector: Sequence[float]) -> bytes:
    """float32 리틀엔디언. 브라우저의 DataView 가 같은 순서로 읽습니다."""
    return struct.pack(f"<{len(vector)}f", *vector)


def batches(items: Sequence, size: int) -> Iterator[list]:
    if size <= 0:
        raise ValueError("배치 크기는 1 이상이어야 합니다")
    for i in range(0, len(items), size):
        yield list(items[i : i + size])


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return f"sha256:{digest.hexdigest()}"


def fingerprints(index_dir: Path, names: Iterable[str] = FINGERPRINT_FILES) -> "dict[str, str]":
    """있는 파일만 담습니다. 없는 파일을 빈 값으로 적으면 불일치 판정이 망가집니다."""
    out = {}
    for name in names:
        path = index_dir / name
        if path.is_file():
            out[name] = sha256_file(path)
    return out


def entity_path(index_dir: Path) -> Path:
    for name in ENTITY_FILES:
        candidate = index_dir / name
        if candidate.is_file():
            return candidate
    raise SystemExit("엔티티 파일을 찾지 못했습니다: %s" % index_dir)


def read_entities(path: Path) -> list:
    import pyarrow.parquet as pq

    table = pq.read_table(path)
    columns = set(table.column_names)
    for required in ("id", "title"):
        if required not in columns:
            raise SystemExit("%s 에 %s 컬럼이 없습니다" % (path.name, required))
    ids = table.column("id").to_pylist()
    titles = table.column("title").to_pylist()
    descriptions = table.column("description").to_pylist() if "description" in columns else [""] * len(ids)
    rows = []
    for i, title, description in zip(ids, titles, descriptions):
        if i is None or str(i) == "":
            continue
        rows.append({"id": str(i), "text": card(str(title or ""), str(description or ""))})
    return rows


def embed_texts(texts: list, base_url: str, model: str, api_key: str) -> list:
    import httpx

    response = httpx.post(
        base_url.rstrip("/") + "/embeddings",
        timeout=TIMEOUT,
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
        json={"model": model, "input": texts},
    )
    response.raise_for_status()
    data = response.json().get("data", [])
    if len(data) != len(texts):
        raise SystemExit("임베딩 %d개를 요청했는데 %d개를 받았습니다" % (len(texts), len(data)))
    return [row["embedding"] for row in data]


def write_parquet(out_path: Path, rows: list, model: str, dim: int, source_files: dict) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq

    table = pa.table(
        {
            "id": pa.array([r["id"] for r in rows], pa.string()),
            "vector": pa.array([r["vector"] for r in rows], pa.binary()),
        }
    )
    # 모델과 차원을 파일 안에 둡니다. 옆에 둔 메모는 파일과 떨어져 다니다 어긋납니다.
    table = table.replace_schema_metadata(
        {
            "model": model,
            "dim": str(dim),
            "source_files": json.dumps(source_files, ensure_ascii=False),
        }
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, out_path, compression="snappy")


def run(
    index_dir: Path,
    out_dir: Path,
    base_url: str,
    model: str,
    api_key: str,
    batch_size: int = BATCH,
    embed: Callable = embed_texts,
    log: Callable = print,
) -> Path:
    rows = read_entities(entity_path(index_dir))
    if not rows:
        raise SystemExit("임베딩할 엔티티가 없습니다")
    log("엔티티 %s건 · 모델 %s" % (format(len(rows), ","), model))

    started = time.time()
    dim = 0
    done = 0
    for batch in batches(rows, batch_size):
        vectors = embed([r["text"] for r in batch], base_url, model, api_key)
        for row, vector in zip(batch, vectors):
            if dim == 0:
                dim = len(vector)
            elif len(vector) != dim:
                raise SystemExit("차원이 섞였습니다: %d 과 %d" % (dim, len(vector)))
            row["vector"] = pack(vector)
        done += len(batch)
        log("  %s/%s · %d초" % (format(done, ","), format(len(rows), ","), round(time.time() - started)))

    out_path = out_dir / "embeddings.parquet"
    write_parquet(out_path, rows, model, dim, fingerprints(index_dir))
    log("%s · %d차원 · %.1fMB" % (out_path, dim, out_path.stat().st_size / 1e6))
    return out_path


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="GraphRAG 엔티티 임베딩 사이드카 생성")
    parser.add_argument("--index", required=True, type=Path, help="색인 Parquet 이 있는 폴더")
    parser.add_argument("--out", type=Path, help="출력 폴더. 기본값은 색인 폴더")
    parser.add_argument("--batch", type=int, default=BATCH)
    parser.add_argument("--check", action="store_true", help="호출 없이 계획만 출력")
    args = parser.parse_args(argv)

    index_dir = args.index
    out_dir = args.out or index_dir
    base_url = os.environ.get("EMBED_BASE_URL", DEFAULT_BASE_URL)
    model = os.environ.get("EMBED_MODEL", DEFAULT_MODEL)

    if args.check:
        rows = read_entities(entity_path(index_dir))
        calls = (len(rows) + args.batch - 1) // args.batch
        print("엔티티 %s건 · 배치 %d · 호출 %d회" % (format(len(rows), ","), args.batch, calls))
        print("제공자 %s · 모델 %s" % (base_url, model))
        print("대조용 지문 %d개 · 출력 %s" % (len(fingerprints(index_dir)), out_dir / "embeddings.parquet"))
        return 0

    api_key = os.environ.get("EMBED_API_KEY", "")
    if not api_key:
        print("EMBED_API_KEY 가 없습니다", file=sys.stderr)
        return 2
    run(index_dir, out_dir, base_url, model, api_key, args.batch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
