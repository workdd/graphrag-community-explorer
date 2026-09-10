#!/usr/bin/env python3
"""Writes a graph that never went near GraphRAG: two CSV tables and nothing else.

The point of this sample is to prove the product does not need a GraphRAG index. It has no
communities, no reports, no source text and no vectors; the app counts the schema from the rows,
draws it, and finds the communities itself.

    python3 samples/generate_graph_sample.py            # writes public/samples/graph/

The shape is a service dependency graph, because that is what most people who have a graph have:
a handful of domains that talk to each other a lot and to the other domains a little, plus the
shared infrastructure everything touches, which is the hub every real graph has and every layout
has to survive.
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "samples" / "graph"

DOMAINS = {
    "checkout": ["cart", "pricing", "payment", "tax", "invoice", "refund"],
    "catalog": ["search", "ranking", "media", "inventory", "pricing-feed"],
    "identity": ["signin", "session", "profile", "consent", "audit"],
    "delivery": ["routing", "warehouse", "tracking", "carrier"],
    "insight": ["events", "warehouse-etl", "report", "forecast"],
}
KINDS = ["service", "queue", "store"]
SHARED = [("config", "store"), ("secrets", "store"), ("gateway", "service"), ("bus", "queue")]
EDGE_TYPES = ["calls", "reads", "publishes", "subscribes"]


def main() -> None:
    random.seed(11)
    OUT.mkdir(parents=True, exist_ok=True)

    nodes: list[dict[str, str]] = []
    by_domain: dict[str, list[str]] = {}

    for domain, parts in DOMAINS.items():
        ids = []
        for part in parts:
            for replica in range(1, 4):
                node_id = f"{domain}-{part}-{replica}"
                ids.append(node_id)
                nodes.append(
                    {
                        "id": node_id,
                        "name": f"{part} {replica}",
                        "type": random.choice(KINDS),
                        "description": f"{part.replace('-', ' ')} in the {domain} domain",
                    }
                )
        by_domain[domain] = ids

    for name, kind in SHARED:
        nodes.append({"id": name, "name": name, "type": kind, "description": f"shared {kind} every domain touches"})

    edges: list[dict[str, str]] = []

    def link(a: str, b: str, weight: int) -> None:
        if a != b:
            edges.append({"source": a, "target": b, "type": random.choice(EDGE_TYPES), "weight": str(weight)})

    # Inside a domain, densely: this is what a community detector should find.
    for ids in by_domain.values():
        for i, a in enumerate(ids):
            for b in random.sample(ids, k=min(4, len(ids))):
                if b != a:
                    link(a, b, random.randint(1, 9))
            if i + 1 < len(ids):
                link(a, ids[i + 1], random.randint(1, 9))

    # Between domains, sparsely.
    names = list(by_domain)
    for i, domain in enumerate(names):
        other = names[(i + 1) % len(names)]
        for _ in range(3):
            link(random.choice(by_domain[domain]), random.choice(by_domain[other]), random.randint(1, 3))

    # And the shared things everything touches, which is the hub the health view should call out.
    everything = [node for ids in by_domain.values() for node in ids]
    for shared, _ in SHARED:
        for node in random.sample(everything, k=len(everything) // 2):
            link(node, shared, 1)

    write(OUT / "nodes.csv", ["id", "name", "type", "description"], nodes)
    write(OUT / "edges.csv", ["source", "target", "type", "weight"], edges)
    print(f"{OUT}: {len(nodes)} nodes, {len(edges)} edges")


def write(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
