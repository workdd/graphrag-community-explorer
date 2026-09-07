#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyarrow>=18,<24"]
# ///
"""Writes the synthetic sample dataset in the Microsoft GraphRAG (>= 1.0) output layout.

Everything here is invented: an e-commerce platform's services, data stores, teams,
vendors and incidents. No production identifiers or statistics are used.

Run:  uv run samples/generate_sample.py      (writes public/samples/demo/*.parquet)
"""
from __future__ import annotations

import random
import uuid
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

random.seed(7)
OUT = Path(__file__).resolve().parent.parent / "public" / "samples" / "demo"

# Three levels: domains (0) > areas (1) > topics (2).
HIERARCHY = {
    "Commerce": {
        "Checkout": ["Cart and pricing", "Payments", "Fraud screening"],
        "Catalog": ["Product data", "Search and ranking"],
        "Fulfilment": ["Warehouse", "Shipping", "Returns"],
    },
    "Content": {
        "Storefront": ["Web storefront", "Mobile apps"],
        "Marketing": ["Campaigns", "Recommendations"],
    },
    "Identity and platform": {
        "Accounts": ["Sign-in", "Profiles and consent"],
        "Platform": ["Observability", "Messaging", "Data platform"],
        "Compliance": ["Audit and retention"],
    },
}
TYPES = ["Service", "Service", "Service", "Database", "Queue", "Team", "Incident", "Vendor"]
VENDORS = ["Acme", "Globex", "Initech", "Umbrella", "Hooli"]
SERVICE_SUFFIX = ["API", "service", "worker", "gateway", "scheduler"]
ISSUE = ["latency spike", "partial outage", "data drift", "failed deploy", "quota breach"]


def stable_id(kind: str, key: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"graphrag-community-explorer/{kind}/{key}"))


entities: list[dict] = []
title_seen: set[str] = set()


def add_entity(title: str, etype: str, description: str) -> dict:
    if title in title_seen:
        title = f"{title} ({len(title_seen)})"
    title_seen.add(title)
    row = {
        "id": stable_id("entity", title),
        "human_readable_id": len(entities),
        "title": title,
        "type": etype,
        "description": description,
        "text_unit_ids": [],
        "frequency": random.randint(1, 20),
        "degree": 0,
        "x": 0.0,
        "y": 0.0,
    }
    entities.append(row)
    return row


def make_entity(topic: str, etype: str, n: int) -> dict:
    word = topic.split()[0]
    if etype == "Service":
        title = f"{word} {random.choice(SERVICE_SUFFIX)} {n}"
        desc = f"{title} handles part of the {topic.lower()} workflow."
    elif etype == "Database":
        title = f"{word} store {n}"
        desc = f"{title} keeps the records that {topic.lower()} services read and write."
    elif etype == "Queue":
        title = f"{word} events {n}"
        desc = f"{title} carries asynchronous messages between {topic.lower()} services."
    elif etype == "Team":
        title = f"{word} team {n}"
        desc = f"{title} owns and operates the {topic.lower()} services."
    elif etype == "Incident":
        title = f"INC-{random.randint(100, 999)} {word} {random.choice(ISSUE)}"
        desc = f"{title} affected {topic.lower()} for {random.randint(5, 90)} minutes."
    else:
        title = f"{random.choice(VENDORS)} {word} {n}"
        desc = f"{title} is an external provider used by {topic.lower()} services."
    return add_entity(title, etype, desc)


# Build membership: topics get their own entities; areas and domains add a few shared ones.
topic_members: dict[str, list[dict]] = {}
area_members: dict[str, list[dict]] = {}
domain_members: dict[str, list[dict]] = {}
for domain, areas in HIERARCHY.items():
    domain_members[domain] = []
    for area, topics in areas.items():
        area_members[area] = []
        for topic in topics:
            members = [make_entity(topic, random.choice(TYPES), i + 1) for i in range(random.randint(6, 11))]
            topic_members[topic] = members
            area_members[area].extend(members)
        for i in range(random.randint(1, 3)):  # area-level shared services not assigned to a topic
            area_members[area].append(make_entity(area, "Service", 90 + i))
        domain_members[domain].extend(area_members[area])
    domain_members[domain].append(make_entity(domain, "Team", 1))

uncovered = [make_entity("Legacy", random.choice(["Service", "Database", "Vendor"]), i + 1) for i in range(20)]
by_id = {e["id"]: e for e in entities}

relationships: list[dict] = []
rel_seen: set[tuple[str, str]] = set()
VERB = {
    ("Service", "Service"): "calls",
    ("Service", "Database"): "writes",
    ("Service", "Queue"): "publishes",
    ("Queue", "Service"): "delivers to",
    ("Team", "Service"): "owns",
    ("Incident", "Service"): "affected",
    ("Vendor", "Service"): "provides",
}


def add_relationship(a: dict, b: dict) -> None:
    if a is b or (a["id"], b["id"]) in rel_seen or (b["id"], a["id"]) in rel_seen:
        return
    verb = VERB.get((a["type"], b["type"])) or VERB.get((b["type"], a["type"]))
    if verb is None:
        verb = "relates to"
    rel_seen.add((a["id"], b["id"]))
    relationships.append({
        "id": stable_id("relationship", f"{a['title']}|{b['title']}"),
        "human_readable_id": len(relationships),
        "source": a["title"],
        "target": b["title"],
        "description": f"{a['title']} {verb} {b['title']}.",
        "weight": float(random.randint(1, 9)),
        "combined_degree": 0,
        "text_unit_ids": [],
    })
    a["degree"] += 1
    b["degree"] += 1


for topic, members in topic_members.items():  # dense inside topics
    for _ in range(int(len(members) * 1.6)):
        add_relationship(random.choice(members), random.choice(members))
for area, members in area_members.items():  # a few across topics of the same area
    for _ in range(4):
        add_relationship(random.choice(members), random.choice(members))
for domain, members in domain_members.items():  # and across areas
    for _ in range(6):
        add_relationship(random.choice(members), random.choice(members))
all_covered = [e for members in domain_members.values() for e in members]
for _ in range(12):  # cross-domain
    add_relationship(random.choice(all_covered), random.choice(all_covered))
for e in uncovered[:12]:  # legacy entities hang off the platform; the last 8 stay isolated
    add_relationship(e, random.choice(all_covered))

for r in relationships:
    src = next(e for e in entities if e["title"] == r["source"])
    dst = next(e for e in entities if e["title"] == r["target"])
    r["combined_degree"] = src["degree"] + dst["degree"]

# Communities in GraphRAG layout: number, level, parent, children, entity_ids, relationship_ids.
communities: list[dict] = []
reports: list[dict] = []
number = 0


def internal_relationship_ids(member_ids: set[str]) -> list[str]:
    return [r["id"] for r in relationships
            if by_title[r["source"]]["id"] in member_ids and by_title[r["target"]]["id"] in member_ids]


by_title = {e["title"]: e for e in entities}
FINDING_TEMPLATES = [
    ("{top} is the hub", "{top} has the most relationships inside the community and connects most other members."),
    ("Data stays local", "Most relationships stay inside the community; only a few cross into neighbouring groups."),
    ("Incidents cluster here", "Recent incidents are attached to the busiest services of this community."),
    ("External providers involved", "Vendor entities supply parts of the workflow, which adds an external dependency."),
]


def add_community(title: str, level: int, parent: int | None, members: list[dict]) -> int:
    global number
    member_ids = sorted({e["id"] for e in members})
    rel_ids = internal_relationship_ids(set(member_ids))
    row = {
        "id": stable_id("community", f"{level}/{title}"),
        "human_readable_id": number,
        "community": number,
        "level": level,
        "parent": -1 if parent is None else parent,
        "children": [],
        "title": title,
        "entity_ids": member_ids,
        "relationship_ids": rel_ids,
        "text_unit_ids": [],
        "period": "2026-09-07",
        "size": len(member_ids),
    }
    communities.append(row)
    if parent is not None:
        communities[parent]["children"].append(number)
    top = max(members, key=lambda e: e["degree"])
    kinds = sorted({e["type"] for e in members})
    findings = random.sample(FINDING_TEMPLATES, k=random.randint(2, 3))
    reports.append({
        "id": stable_id("report", f"{level}/{title}"),
        "human_readable_id": number,
        "community": number,
        "level": level,
        "parent": row["parent"],
        "children": row["children"],
        "title": title,
        "summary": (f"{title} groups {len(member_ids)} entities ({', '.join(kinds)}) with {len(rel_ids)} internal relationships. "
                    f"{top['title']} is the most connected member."),
        "full_content": "",
        "rank": round(random.uniform(4.0, 9.5), 1),
        "rating_explanation": "Synthetic rating for demonstration only.",
        "findings": [{"summary": s.format(top=top["title"]), "explanation": e.format(top=top["title"])} for s, e in findings],
        "full_content_json": "",
        "period": "2026-09-07",
        "size": len(member_ids),
    })
    number += 1
    return number - 1


for domain, areas in HIERARCHY.items():
    d = add_community(domain, 0, None, domain_members[domain])
    for area, topics in areas.items():
        a = add_community(area, 1, d, area_members[area])
        for topic in topics:
            add_community(topic, 2, a, topic_members[topic])
for r in reports:  # children lists are filled after all communities exist
    r["children"] = communities[r["community"]]["children"]

S, I, D, L = pa.string(), pa.int64(), pa.float64(), pa.list_(pa.string())
SCHEMAS = {
    "entities": pa.schema([("id", S), ("human_readable_id", I), ("title", S), ("type", S), ("description", S),
                           ("text_unit_ids", L), ("frequency", I), ("degree", I), ("x", D), ("y", D)]),
    "relationships": pa.schema([("id", S), ("human_readable_id", I), ("source", S), ("target", S), ("description", S),
                                ("weight", D), ("combined_degree", I), ("text_unit_ids", L)]),
    "communities": pa.schema([("id", S), ("human_readable_id", I), ("community", I), ("level", I), ("parent", I),
                              ("children", pa.list_(I)), ("title", S), ("entity_ids", L), ("relationship_ids", L),
                              ("text_unit_ids", L), ("period", S), ("size", I)]),
    "community_reports": pa.schema([("id", S), ("human_readable_id", I), ("community", I), ("level", I), ("parent", I),
                                    ("children", pa.list_(I)), ("title", S), ("summary", S), ("full_content", S),
                                    ("rank", D), ("rating_explanation", S),
                                    ("findings", pa.list_(pa.struct([("summary", S), ("explanation", S)]))),
                                    ("full_content_json", S), ("period", S), ("size", I)]),
}
OUT.mkdir(parents=True, exist_ok=True)
for name, rows in (("entities", entities), ("relationships", relationships), ("communities", communities), ("community_reports", reports)):
    pq.write_table(pa.Table.from_pylist(rows, schema=SCHEMAS[name]), OUT / f"{name}.parquet", compression="NONE")
levels = sorted({c["level"] for c in communities})
covered = {eid for c in communities for eid in c["entity_ids"]}
isolated = sum(1 for e in entities if e["degree"] == 0)
print(f"entities={len(entities)} relationships={len(relationships)} communities={len(communities)} levels={levels} "
      f"covered={len(covered)} isolated={isolated} -> {OUT}")
