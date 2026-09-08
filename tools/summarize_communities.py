#!/usr/bin/env python3
"""커뮤니티 집합에 요약을 만들어 붙입니다.

Global 검색은 커뮤니티 요약만 읽습니다. 멤버 목록도 관계도 모델에 가지 않으므로,
요약이 없는 커뮤니티는 Global 에게 존재하지 않는 것과 같습니다. 재계산한 커뮤니티
집합은 요약이 없어 뷰어에는 보이지만 Global 에서는 쓰이지 않습니다. 이 도구가
그 간극을 메웁니다.

    python3 summarize_communities.py --index <폴더> --set recluster --check
    python3 summarize_communities.py --index <폴더> --set recluster

제공자는 OpenAI 호환이면 됩니다.

    LLM_BASE_URL   기본값 https://api.upstage.ai/v1
    LLM_MODEL      기본값 solar-pro2
    LLM_API_KEY    필수

만들어진 <set>_community_reports.parquet 을 색인 옆에 두면 뷰어가 그 집합의
요약으로 읽고 Global 검색이 쓸 수 있게 됩니다. 색인 자체의 보고서는 건드리지
않습니다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Callable, Sequence

DEFAULT_BASE_URL = "https://api.upstage.ai/v1"
DEFAULT_MODEL = "solar-pro2"
MEMBERS_IN_PROMPT = 60
TIMEOUT = 120.0
RETRIES = 6
BACKOFF = 2.0

SYSTEM = (
    "You describe one community of a knowledge graph so that a later question can be answered "
    "from your description alone. Answer with JSON only, shaped as "
    '{"title": "...", "summary": "...", "rank": 0, "rank_explanation": "..."}. '
    "title is a short noun phrase naming what the members have in common. "
    "summary is two to four sentences: what the community holds, what connects it, and what stands out. "
    "rank is 0 to 10 for how much this community would matter to someone asking about the whole graph. "
    "Describe only what the members show; never invent a member, a count or a relationship."
)


def wait_for(attempt: int, retry_after: str = "") -> float:
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass
    return BACKOFF ** attempt


def should_retry(status: int) -> bool:
    return status == 429 or status >= 500


def member_lines(titles: Sequence[str], kinds: Sequence[str], limit: int = MEMBERS_IN_PROMPT):
    """프롬프트에 실을 멤버 줄과 생략된 수.

    큰 묶음은 수백 개를 담습니다. 전부 실으면 예산을 넘고, 자르고 말하지 않으면
    모델이 그 수가 전부라고 여겨 "총 60개" 같은 틀린 문장을 씁니다.
    """
    rows = ["- %s (%s)" % (t, k) for t, k in zip(titles[:limit], kinds[:limit])]
    return rows, max(0, len(titles) - limit)


def internal_link_types(member_titles: Sequence[str], sources: Sequence[str],
                        targets: Sequence[str], types: Sequence[str], limit: int = 12):
    """이 묶음 안에서 양 끝이 모두 멤버인 관계의 유형과 건수.

    색인 전체의 관계 유형을 넘기면 모델이 이 묶음에 없는 관계를 있다고 씁니다.
    실제로 그런 문장이 나왔습니다.
    """
    members = set(member_titles)
    counts = {}
    for src, tgt, kind in zip(sources, targets, types):
        if src in members and tgt in members:
            counts[str(kind)] = counts.get(str(kind), 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return ["%s (%d)" % (k, n) for k, n in ranked[:limit]]


def build_prompt(title: str, level: int, titles: Sequence[str], kinds: Sequence[str],
                 links: Sequence[str], limit: int = MEMBERS_IN_PROMPT, language: str = "") -> str:
    rows, omitted = member_lines(titles, kinds, limit)
    parts = ["# Community", "level: %d" % level, "members: %d" % len(titles)]
    if title:
        parts.append("working title: %s" % title)
    parts += ["", "# Members"] + rows
    if omitted:
        parts.append("- and %d more members not listed" % omitted)
    if links:
        parts += ["", "# Relationships inside this community"] + ["- %s" % l for l in links]
    else:
        parts += ["", "No relationship has both ends inside this community."]
    if language:
        parts += ["", "Write the title and summary in %s." % language]
    return "\n".join(parts)


def parse_report(raw: str) -> dict:
    """모델이 돌려준 JSON. 못 읽으면 빈 요약을 내고 부르는 쪽이 건너뜁니다."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        data = json.loads(text)
    except ValueError:
        return {"title": "", "summary": "", "rank": 0.0, "rank_explanation": ""}
    if not isinstance(data, dict):
        return {"title": "", "summary": "", "rank": 0.0, "rank_explanation": ""}
    rank = data.get("rank")
    try:
        rank = float(rank)
    except (TypeError, ValueError):
        rank = 0.0
    return {
        "title": str(data.get("title") or "").strip(),
        "summary": str(data.get("summary") or "").strip(),
        "rank": max(0.0, min(10.0, rank)),
        "rank_explanation": str(data.get("rank_explanation") or "").strip(),
    }


def ask(prompt: str, base_url: str, model: str, api_key: str, log=None) -> dict:
    import httpx

    last = ""
    for attempt in range(RETRIES):
        response = httpx.post(
            base_url.rstrip("/") + "/chat/completions",
            timeout=TIMEOUT,
            headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
            json={"model": model, "temperature": 0,
                  "messages": [{"role": "system", "content": SYSTEM},
                               {"role": "user", "content": prompt}]},
        )
        if response.status_code == 200:
            body = response.json()
            content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
            report = parse_report(content)
            report["usage"] = body.get("usage") or {}
            return report
        last = "%d %s" % (response.status_code, response.text[:200])
        if not should_retry(response.status_code):
            raise SystemExit("제공자 오류: " + last)
        delay = wait_for(attempt, response.headers.get("retry-after", ""))
        if log:
            log("  %s · %.1f초 뒤 다시 시도 (%d/%d)" % (last.split(" ")[0], delay, attempt + 1, RETRIES))
        time.sleep(delay)
    raise SystemExit("재시도 %d회 후에도 실패했습니다: %s" % (RETRIES, last))


KOREAN = re.compile(r"[가-힣]")


def detect_language(index: Path) -> str:
    """색인 자체의 보고서와 같은 언어로 씁니다. 한 집합만 영어면 화면이 뒤섞입니다."""
    import pyarrow.parquet as pq

    path = index / "community_reports.parquet"
    if not path.is_file():
        return ""
    try:
        summaries = pq.read_table(path).to_pydict().get("summary") or []
    except Exception:
        return ""
    sample = " ".join(str(s or "") for s in summaries[:20])
    return "Korean" if len(KOREAN.findall(sample)) > 20 else ""


def read_inputs(index: Path, label: str):
    import pyarrow.parquet as pq

    com_path = index / ("%s_communities.parquet" % label)
    if not com_path.is_file():
        raise SystemExit("커뮤니티 집합을 찾지 못했습니다: %s" % com_path)
    com = pq.read_table(com_path).to_pydict()
    ent_path = index / "entities.parquet"
    if not ent_path.is_file():
        ent_path = index / "create_final_entities.parquet"
    ent = pq.read_table(ent_path).to_pydict()
    by_id = {str(i): (str(t), str(k)) for i, t, k in zip(ent["id"], ent["title"], ent["type"])}
    rel_path = index / "relationships.parquet"
    rels = pq.read_table(rel_path).to_pydict() if rel_path.is_file() else {"type": [], "source": [], "target": []}
    return com, by_id, rels


def existing_reports(path: Path) -> dict:
    import pyarrow.parquet as pq

    if not path.is_file():
        return {}
    rows = pq.read_table(path).to_pylist()
    return {str(r.get("community")): r for r in rows if str(r.get("summary") or "").strip()}


def write_reports(path: Path, rows: list) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq

    S, I, F = pa.string(), pa.int64(), pa.float64()
    schema = pa.schema([("id", S), ("human_readable_id", I), ("community", I), ("level", I),
                        ("title", S), ("summary", S), ("full_content", S),
                        ("rank", F), ("rank_explanation", S)])
    pq.write_table(pa.Table.from_pylist(rows, schema=schema), path, compression="NONE")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="커뮤니티 집합에 요약 생성")
    ap.add_argument("--index", required=True, type=Path)
    ap.add_argument("--set", required=True, dest="label", help="<label>_communities.parquet 의 label")
    ap.add_argument("--members", type=int, default=MEMBERS_IN_PROMPT)
    ap.add_argument("--limit", type=int, help="처음 N개만 처리 (시험용)")
    ap.add_argument("--language", default="", help="요약 언어. 비우면 색인의 기존 보고서를 보고 정합니다")
    ap.add_argument("--check", action="store_true", help="호출 없이 계획만 출력")
    args = ap.parse_args(argv)

    com, by_id, rels = read_inputs(args.index, args.label)
    out_path = args.index / ("%s_community_reports.parquet" % args.label)
    done = existing_reports(out_path)
    total = len(com["id"])
    todo = [i for i in range(total) if str(com["community"][i]) not in done]
    if args.limit:
        todo = todo[: args.limit]

    language = args.language or detect_language(args.index)
    base_url = os.environ.get("LLM_BASE_URL", DEFAULT_BASE_URL)
    model = os.environ.get("LLM_MODEL", DEFAULT_MODEL)
    if args.check:
        print("요약 언어: %s" % (language or "모델 판단"))
        print("커뮤니티 %d개 · 이미 요약됨 %d개 · 이번에 호출 %d회" % (total, len(done), len(todo)))
        print("제공자 %s · 모델 %s · 멤버 상한 %d" % (base_url, model, args.members))
        print("출력 %s" % out_path)
        return 0

    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        print("LLM_API_KEY 가 없습니다", file=sys.stderr)
        return 2

    rows = list(done.values())
    started = time.time()
    prompt_tokens = completion_tokens = 0
    for n, i in enumerate(todo, start=1):
        members = [by_id.get(str(x)) for x in (com["entity_ids"][i] or [])]
        members = [m for m in members if m]
        titles = [m[0] for m in members]
        kinds = [m[1] for m in members]
        links = internal_link_types(titles, rels.get("source") or [], rels.get("target") or [],
                                    rels.get("type") or [])
        prompt = build_prompt(str(com["title"][i] or ""), int(com["level"][i] or 0), titles, kinds,
                              links, args.members, language)
        report = ask(prompt, base_url, model, api_key, log=print)
        usage = report.pop("usage", {})
        prompt_tokens += int(usage.get("prompt_tokens") or 0)
        completion_tokens += int(usage.get("completion_tokens") or 0)
        if not report["summary"]:
            print("  %d/%d 건너뜀 (요약을 읽지 못함) %s" % (n, len(todo), com["id"][i]))
            continue
        rows.append({
            "id": "report:%s" % com["id"][i],
            "human_readable_id": int(com["community"][i]),
            "community": int(com["community"][i]),
            "level": int(com["level"][i] or 0),
            "title": report["title"] or str(com["title"][i] or ""),
            "summary": report["summary"],
            "full_content": report["summary"],
            "rank": report["rank"],
            "rank_explanation": report["rank_explanation"],
        })
        # 매번 저장합니다. 중간에 끊겨도 다시 돌리면 남은 것만 부릅니다.
        write_reports(out_path, rows)
        print("  %d/%d · %s · %d초" % (n, len(todo), report["title"][:40], round(time.time() - started)))

    print("%s · 요약 %d개 · 토큰 %d + %d" % (out_path, len(rows), prompt_tokens, completion_tokens))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
