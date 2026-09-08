#!/usr/bin/env python3
"""연결 요소 전부에 Leiden 을 돌려 커뮤니티를 다시 나눕니다.

    python3 recluster_communities.py --index <내보내기 폴더>
    python3 recluster_communities.py --index <폴더> --report-only   # 그래프 통계만
    python3 recluster_communities.py --index <폴더> --fold-hubs     # 허브 접기 (권장하지 않음)

만들어진 <label>_communities.parquet 을 색인 옆에 두면 뷰어가 전환 가능한 커뮤니티
집합으로 읽습니다. 원래 커뮤니티를 덮어쓰지 않습니다.

## 왜 전체 요소인가

자원 그래프(엔티티 2,674개, 관계 4,580개)에서 실측한 값입니다.

    방식                          커뮤니티   소속       커버리지   modularity
    운영 파이프라인                    41   1,208건        45%      기록 없음
    최대 요소만 Leiden                 38   1,713건        64%      0.50~0.53
    전체 요소 + 허브 접기           34~46   2,071건        77%      0.44
    전체 요소 (이 도구의 기본값)    34~43   2,089건        78%      0.59~0.60

가장 큰 이득은 "최대 연결 요소만 클러스터링한다"는 제약을 없앤 데서 나옵니다.
자원 그래프는 요소가 29개로 쪼개져 있어(고립 노드 585개는 별도), 최대 요소만
다루면 나머지를 통째로 버리게 됩니다.

## 허브 접기를 기본값으로 두지 않는 이유

같은 허브에 매달린 자원끼리 직접 잇는 변환입니다. 별이 클리크가 되어 나눌 구조가
생길 것으로 보이지만, 허브의 이웃은 이미 같은 연결 요소 안이므로 요소가 합쳐지지
않습니다. 커버리지는 오르지 않고 약한 클리크 엣지가 6만 개 이상 늘어 modularity 만
0.60 에서 0.44 로 떨어집니다. 다른 모양의 그래프를 위해 --fold-hubs 로 남겨 둡니다.

## 남는 한계

커버리지 78% 가 상한입니다. 관계가 하나도 없는 엔티티 585개(22%)는 위상만으로는
어느 묶음에도 넣을 수 없습니다.
"""
from __future__ import annotations

import argparse
import collections
import json
import math
from pathlib import Path

DEFAULT_HUB_MIN = 12
DEFAULT_HUB_MAX = 300
ENTITY_FILES = ("entities.parquet", "create_final_entities.parquet")
REL_FILES = ("relationships.parquet", "create_final_relationships.parquet")


def pick(index: Path, names) -> Path:
    for name in names:
        if (index / name).is_file():
            return index / name
    raise SystemExit("%s 에서 %s 를 찾지 못했습니다" % (index, " 또는 ".join(names)))


def read_graph(index: Path):
    import pyarrow.parquet as pq

    ent = pq.read_table(pick(index, ENTITY_FILES)).to_pydict()
    rel = pq.read_table(pick(index, REL_FILES)).to_pydict()
    nodes = {str(t): {"id": str(i), "kind": str(k)} for i, t, k in zip(ent["id"], ent["title"], ent["type"])}
    edges = [(str(s), str(t)) for s, t in zip(rel["source"], rel["target"]) if str(s) != str(t)]
    edges = [(s, t) for s, t in edges if s in nodes and t in nodes]
    return nodes, edges


def adjacency(edges):
    adj = collections.defaultdict(set)
    for s, t in edges:
        adj[s].add(t)
        adj[t].add(s)
    return adj


def components(nodes, adj):
    """연결 요소 크기를 큰 것부터. 고립 노드는 크기 1 요소입니다."""
    seen, sizes = set(), []
    for start in nodes:
        if start in seen:
            continue
        stack, size = [start], 0
        seen.add(start)
        while stack:
            cur = stack.pop()
            size += 1
            for nxt in adj.get(cur, ()):  # noqa: SIM118
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def pick_hubs(adj, hub_min: int, hub_max: int):
    """접을 허브. 너무 작으면 접을 게 없고, 너무 크면 아무것도 구별하지 못합니다.

    모두와 이어진 노드는 "함께 있다"는 정보를 담지 않습니다. 자원 그래프의
    VolumeType __DEFAULT__ 가 그렇습니다. 상한을 두는 이유입니다.
    """
    hubs, skipped = [], []
    for node, neighbours in adj.items():
        size = len(neighbours)
        if size < hub_min:
            continue
        (hubs if size <= hub_max else skipped).append((node, size))
    return sorted(hubs, key=lambda x: -x[1]), sorted(skipped, key=lambda x: -x[1])


def project(adj, hubs):
    """같은 허브에 매달린 이웃끼리 잇습니다.

    가중치는 허브 크기에 반비례합니다(1/(n-1)). 큰 허브가 만든 연결은 약하게,
    작은 허브가 만든 연결은 강하게 셉니다. 그렇게 하지 않으면 가장 큰 허브 하나가
    전체 가중치를 지배해 나머지 구조가 묻힙니다.
    """
    weights = collections.Counter()
    for hub, size in hubs:
        members = sorted(adj[hub])
        if len(members) < 2:
            continue
        share = 1.0 / (len(members) - 1)
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                weights[(a, b) if a < b else (b, a)] += share
    return weights


def direct_edges(edges, hub_ids):
    """허브를 거치지 않는 원래 관계. 투영 결과와 합칩니다."""
    weights = collections.Counter()
    for s, t in edges:
        if s in hub_ids or t in hub_ids:
            continue
        weights[(s, t) if s < t else (t, s)] += 1.0
    return weights


def run_leiden(nodes, weights, resolutions, seed):
    import igraph as ig
    import leidenalg

    names = sorted({n for pair in weights for n in pair})
    index = {n: i for i, n in enumerate(names)}
    graph = ig.Graph(n=len(names), edges=[(index[a], index[b]) for a, b in weights], directed=False)
    graph.es["weight"] = [w for w in weights.values()]
    out = []
    for resolution in resolutions:
        part = leidenalg.find_partition(
            graph, leidenalg.RBConfigurationVertexPartition,
            weights="weight", resolution_parameter=resolution, seed=seed)
        groups = [sorted(names[i] for i in members) for members in part]
        out.append({"resolution": resolution, "modularity": float(part.modularity), "groups": groups})
    return out


def write_partition(out_dir: Path, nodes, levels, label: str, fold_hubs: bool = False):
    import pyarrow as pa
    import pyarrow.parquet as pq

    rows = []
    for level, run in enumerate(levels, start=1):
        for number, members in enumerate(sorted(run["groups"], key=len, reverse=True)):
            kinds = collections.Counter(nodes[m]["kind"] for m in members)
            rows.append({
                "id": "%s:L%d:%04d" % (label, level, number),
                "community": number,
                "level": level,
                "parent": None,
                "title": " / ".join(k for k, _ in kinds.most_common(3)),
                "entity_ids": [nodes[m]["id"] for m in members],
                "size": len(members),
                "modularity": run["modularity"],
                "method": "Hub folding then Leiden" if fold_hubs else "Leiden over every component",
                "resolution": run["resolution"],
            })
    out_dir.mkdir(parents=True, exist_ok=True)
    destination = out_dir / ("%s_communities.parquet" % label)
    pq.write_table(pa.Table.from_pylist(rows), destination, compression="NONE")
    # compare_community_partitions.py 가 읽는 멤버십 표. 같은 실행에서 함께 써야
    # 비교가 낡은 쪽을 보지 않습니다. 이름이 <label>_communities.parquet 로 끝나면
    # 뷰어가 커뮤니티 집합으로 오인해 읽으려 하므로 다른 접미사를 씁니다.
    memberships = [{"entity_id": e, "community": r["id"], "level": r["level"]}
                   for r in rows for e in r["entity_ids"]]
    pq.write_table(pa.Table.from_pylist(memberships), out_dir / "entity_membership.parquet",
                   compression="NONE")
    return destination, rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="허브 투영 후 Leiden")
    ap.add_argument("--index", required=True, type=Path, help="내보낸 Parquet 폴더")
    ap.add_argument("--out", type=Path, help="출력 폴더. 기본값은 색인 폴더")
    ap.add_argument("--label", default="recluster", help="만들어질 커뮤니티 집합 이름")
    ap.add_argument("--fold-hubs", action="store_true",
                    help="같은 허브에 매달린 자원끼리 잇습니다. 실측에서 modularity 가 떨어져 기본값은 꺼짐입니다")
    ap.add_argument("--hub-min", type=int, default=DEFAULT_HUB_MIN)
    ap.add_argument("--hub-max", type=int, default=DEFAULT_HUB_MAX)
    ap.add_argument("--resolution", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--report-only", action="store_true", help="투영 전후 통계만 출력")
    args = ap.parse_args(argv)

    nodes, edges = read_graph(args.index)
    adj = adjacency(edges)
    before = components(nodes, adj)
    hubs, skipped = pick_hubs(adj, args.hub_min, args.hub_max) if args.fold_hubs else ([], [])
    hub_ids = {h for h, _ in hubs}

    weights = project(adj, hubs)
    weights.update(direct_edges(edges, hub_ids))
    after_adj = adjacency(list(weights))
    covered = {n for pair in weights for n in pair}
    after = components({n: None for n in covered}, after_adj)

    report = {
        "nodes": len(nodes),
        "edges": len(edges),
        "hubs_folded": len(hubs),
        "hubs_skipped_as_too_wide": [{"name": n[:60], "degree": d} for n, d in skipped[:8]],
        "before": {"components": len(before), "largest": before[0] if before else 0,
                   "singletons": sum(1 for s in before if s == 1),
                   "largest_share": round((before[0] if before else 0) / len(nodes), 3)},
        "after": {"nodes_in_graph": len(covered), "components": len(after),
                  "largest": after[0] if after else 0,
                  "largest_share": round((after[0] if after else 0) / len(nodes), 3),
                  "edges": len(weights)},
    }
    if args.report_only:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    ladder = [max(0.2, args.resolution * 0.35), args.resolution, max(1.8, args.resolution * 1.8)]
    levels = run_leiden(nodes, weights, ladder, args.seed)
    destination, rows = write_partition(args.out or args.index, nodes, levels, args.label, args.fold_hubs)
    report["partitions"] = [
        {"level": i + 1, "resolution": r["resolution"], "modularity": round(r["modularity"], 4),
         "communities": len(r["groups"]),
         "assigned": len({m for g in r["groups"] for m in g}),
         "coverage": round(len({m for g in r["groups"] for m in g}) / len(nodes), 3),
         "largest": max((len(g) for g in r["groups"]), default=0)}
        for i, r in enumerate(levels)]
    report["written"] = str(destination)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
