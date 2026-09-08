#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.2,<4", "pyarrow>=18,<24", "python-dotenv>=1,<2"]
# ///
"""Export an AGE snapshot and GraphRAG Visualizer artifacts without DB writes.

Run with uv run tools/export_age_parquet.py --env-file PATH --output NEW_DIR.
Vertices become entities, the community label becomes communities, and the membership label
joins the two. Graphs that label every vertex `Resource` and graphs that label vertices by kind
(User, Role, Menu, ...) both work; see --entity-labels.
All labels/properties are additionally retained under snapshot/.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path

import psycopg
from psycopg import sql
import pyarrow as pa
import pyarrow.parquet as pq
from dotenv import dotenv_values


def read_snapshot(config, graph):
    params = {key: config.get(env, default) for key, env, default in (
        ("host", "AGE_HOST", None), ("port", "AGE_PORT", "5432"),
        ("dbname", "AGE_DB", "graphrag"), ("user", "AGE_USER", "postgres"),
        ("password", "AGE_PASSWORD", ""))}
    if not params["host"]:
        raise ValueError("AGE_HOST is required")
    vertices, edges = [], []
    with psycopg.connect(**params, connect_timeout=5, application_name="age_parquet_export") as conn:
        conn.read_only = True
        conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '60s'")
            cur.execute("SET LOCAL search_path = ag_catalog, public")
            cur.execute("SELECT graphid FROM ag_catalog.ag_graph WHERE name = %s", (graph,))
            if not cur.fetchone():
                raise ValueError(f"Graph not found: {graph}")
            cur.execute("""SELECT l.name, l.kind, n.nspname, t.relname
                FROM ag_catalog.ag_label l
                JOIN ag_catalog.ag_graph g ON g.graphid = l.graph
                JOIN pg_class t ON t.oid = l.relation
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE g.name = %s ORDER BY l.kind, l.name""", (graph,))
            labels = cur.fetchall()
            for label, kind, schema, table in labels:
                columns = "id::text, properties::text"
                if kind == "e":
                    columns += ", start_id::text, end_id::text"
                # ONLY avoids counting inherited label tables more than once.
                query = sql.SQL("SELECT {} FROM ONLY {}.{} ORDER BY id").format(
                    sql.SQL(columns), sql.Identifier(schema), sql.Identifier(table))
                cur.execute(query)
                for row in cur:
                    properties = json.loads(row[1])
                    if not isinstance(properties, dict):
                        raise ValueError(f"Non-object properties at {label}/{row[0]}")
                    record = dict(id=row[0], label=label, properties=properties,
                                  properties_agtype=row[1])
                    if kind == "e":
                        record.update(source=row[2], target=row[3])
                        edges.append(record)
                    else:
                        vertices.append(record)
    return vertices, edges


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def pick_entity_labels(vertices, requested, community_label):
    """`auto` keeps the historical Resource-only behaviour when that label exists, and otherwise
    takes every vertex label except the community one, which is what kind-labelled graphs need."""
    present = {v["label"] for v in vertices}
    if requested and requested != "auto":
        names = [name.strip() for name in requested.split(",") if name.strip()]
        missing = [name for name in names if name not in present]
        if missing:
            raise ValueError(f"Vertex labels not in the graph: {', '.join(missing)}")
        return set(names)
    if "Resource" in present:
        return {"Resource"}
    return {label for label in present if label != community_label and not label.startswith("_ag_")}


def community_title(properties, business_id):
    """Existing labels only. `kinds` is a formatted census such as `User 111 · Label 60`; its
    leading kind names make a readable title when the producer wrote no title at all."""
    for key in ("title", "hub_name", "name"):
        value = properties.get(key)
        if value not in (None, ""):
            return str(value)
    kinds = properties.get("kinds")
    if isinstance(kinds, str) and kinds.strip():
        names = [part.strip().rsplit(" ", 1)[0] for part in kinds.split("·") if part.strip()]
        if names:
            return " / ".join(names[:3])
    return str(business_id)


def resolve_parent(raw, business_ids):
    """Producers reference a parent by its full business id or by a suffix of it
    (`L1:14` for `community:gov:L1:14`). Both resolve; anything else is an error."""
    if raw in (None, "", -1, "-1"):
        return None
    key = str(raw)
    if key in business_ids:
        return key
    matches = [known for known in business_ids if known.endswith(key)]
    if len(matches) == 1:
        return matches[0]
    return None


def convert(vertices, edges, graph, entity_labels="auto", community_label="Community",
            membership_label="inCommunity"):
    by_id = {v["id"]: v for v in vertices}
    if len(by_id) != len(vertices) or len({e["id"] for e in edges}) != len(edges):
        raise ValueError("Duplicate AGE IDs")
    for edge in edges:
        if edge["source"] not in by_id or edge["target"] not in by_id:
            raise ValueError(f"Dangling edge: {edge['id']}")
    wanted = pick_entity_labels(vertices, entity_labels, community_label)
    resources = sorted((v for v in vertices if v["label"] in wanted), key=lambda v: int(v["id"]))
    clusters = sorted((v for v in vertices if v["label"] == community_label), key=lambda v: int(v["id"]))
    if not resources:
        raise ValueError(f"No vertices for labels {sorted(wanted)}; nothing to export")
    entities, titles = [], {}
    for index, vertex in enumerate(resources):
        p, vid = vertex["properties"], vertex["id"]
        name = p.get("name") or p.get("title") or p.get("cmpResourceId") or p.get("id") or vid
        # The viewer joins relationships by title, so even duplicate names must be unique.
        title = f"{p.get('kind') or vertex['label']} · {name} [AGE:{vid}]"
        titles[vid] = title
        entities.append(dict(id=vid, human_readable_id=index, title=title,
            type=str(p.get("kind") or vertex["label"]), description=encode(p), text_unit_ids=[],
            age_label=vertex["label"], age_properties_json=encode(p)))

    numbers = {v["id"]: i for i, v in enumerate(clusters)}
    business_ids = {}
    for v in clusters:
        key = v["properties"].get("id")
        if key is None or str(key) in business_ids:
            raise ValueError("Community.id must be present and unique")
        business_ids[str(key)] = numbers[v["id"]]
    warnings = []
    members = defaultdict(set)
    skipped_membership = 0
    for e in edges:
        if e["label"] != membership_label:
            continue
        if e["target"] not in numbers:
            raise ValueError(f"{membership_label} edge {e['id']} does not end at a {community_label}")
        # A member outside the exported labels is dropped rather than fatal: --entity-labels may
        # deliberately narrow the export, and the community keeps the members that were exported.
        if e["source"] not in titles:
            skipped_membership += 1
            continue
        members[e["target"]].add(e["source"])
    if skipped_membership:
        warnings.append(f"{skipped_membership} {membership_label} edges start outside the exported entity labels and were skipped")

    resource_edges = [e for e in edges if e["source"] in titles and e["target"] in titles]
    degree = Counter()
    for e in resource_edges:
        degree.update((e["source"], e["target"]))
    relationships = []
    for index, e in enumerate(resource_edges):
        p = e["properties"]
        weight = p.get("weight", 1.0)
        if not isinstance(weight, (int, float)) or isinstance(weight, bool) or not math.isfinite(weight):
            raise ValueError(f"Invalid weight on edge {e['id']}")
        relationships.append(dict(id=e["id"], human_readable_id=index,
            source=titles[e["source"]], target=titles[e["target"]],
            description=f"{e['label']}\n{encode(p)}", weight=float(weight),
            combined_degree=degree[e["source"]] + degree[e["target"]], text_unit_ids=[],
            type=e["label"], age_source_id=e["source"], age_target_id=e["target"],
            age_properties_json=encode(p)))

    communities, reports = [], []
    for v in clusters:
        p, vid = v["properties"], v["id"]
        number, membership = numbers[vid], members[vid]
        parent_key = p.get("parent_id", p.get("parentId"))
        parent = -1
        if parent_key not in (None, "", -1, "-1"):
            resolved = resolve_parent(parent_key, business_ids)
            if resolved is None:
                raise ValueError(f"Unknown parent for community {p['id']}: {parent_key}")
            parent = business_ids[resolved]
        if p.get("member_count") is not None and int(p["member_count"]) != len(membership):
            warnings.append(f"Community {p['id']}: stored member_count={p['member_count']}, actual={len(membership)}")
        level = int(p.get("level", 0))
        title = community_title(p, p["id"])
        internal_edges = [e["id"] for e in resource_edges
                          if e["source"] in membership and e["target"] in membership]
        cid = f"age-community:{graph}:{vid}"
        communities.append(dict(id=cid, human_readable_id=number, community=number,
            parent=parent, level=level, title=title, entity_ids=sorted(membership, key=int),
            relationship_ids=internal_edges, text_unit_ids=[], period="", size=len(membership),
            age_id=vid, age_properties_json=encode(p)))
        # Existing AGE summaries only; never invent findings, ranking or source documents.
        if p.get("summary"):
            reports.append(dict(id=f"report:{cid}", human_readable_id=number,
                community=number, parent=parent, level=level, title=title,
                summary=str(p["summary"]), full_content=encode(p), rank=None,
                rank_explanation="", findings=[], full_content_json=encode(p),
                period="", size=len(membership)))
    return entities, relationships, communities, reports, warnings


S = pa.string()
I = pa.int64()
L = pa.list_(S)
SCHEMAS = {
    "entities": pa.schema([(k, t) for k, t in [
        ("id", S), ("human_readable_id", I), ("title", S), ("type", S),
        ("description", S), ("text_unit_ids", L), ("age_label", S), ("age_properties_json", S)]]),
    "relationships": pa.schema([(k, t) for k, t in [
        ("id", S), ("human_readable_id", I), ("source", S), ("target", S),
        ("description", S), ("weight", pa.float64()), ("combined_degree", I),
        ("text_unit_ids", L), ("type", S), ("age_source_id", S), ("age_target_id", S), ("age_properties_json", S)]]),
    "communities": pa.schema([(k, t) for k, t in [
        ("id", S), ("human_readable_id", I), ("community", I), ("parent", I),
        ("level", I), ("title", S), ("entity_ids", L), ("relationship_ids", L),
        ("text_unit_ids", L), ("period", S), ("size", I), ("age_id", S), ("age_properties_json", S)]]),
    "community_reports": pa.schema([(k, t) for k, t in [
        ("id", S), ("human_readable_id", I), ("community", I), ("parent", I),
        ("level", I), ("title", S), ("summary", S), ("full_content", S),
        ("rank", pa.float64()), ("rank_explanation", S),
        ("findings", pa.list_(pa.struct([("summary", S), ("explanation", S)]))),
        ("full_content_json", S), ("period", S), ("size", I)]]),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--graph", help="Defaults to AGE_GRAPH from config")
    parser.add_argument("--output", type=Path, required=True, help="New output directory; never overwrite")
    parser.add_argument("--entity-labels", default="auto",
                        help="Comma-separated vertex labels to export as entities. "
                             "auto (default) uses Resource when present, otherwise every label but the community one")
    parser.add_argument("--community-label", default="Community")
    parser.add_argument("--membership-label", default="inCommunity")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; choose a new directory")
    if args.env_file and not args.env_file.is_file():
        parser.error("Env file does not exist")
    config = {**(dotenv_values(args.env_file) if args.env_file else {}), **os.environ}
    graph = args.graph or config.get("AGE_GRAPH", "cmp_gate0")
    vertices, edges = read_snapshot(config, graph)
    entities, relationships, communities, reports, warnings = convert(
        vertices, edges, graph, entity_labels=args.entity_labels,
        community_label=args.community_label, membership_label=args.membership_label)
    args.output.mkdir(parents=True, exist_ok=False)
    artifacts = args.output / "artifacts"
    snapshot = args.output / "snapshot"
    artifacts.mkdir()
    snapshot.mkdir()
    for name, rows in zip(SCHEMAS, (entities, relationships, communities, reports)):
        table = pa.Table.from_pylist(rows, schema=SCHEMAS[name])
        # Uncompressed Parquet is compatible with the viewer's hyparquet reader.
        destination = artifacts / f"{name}.parquet"
        pq.write_table(table, destination, compression="NONE")
        if pq.read_table(destination).to_pylist() != rows:
            raise ValueError(f"Parquet round-trip mismatch: {name}")
    for name, rows in (("vertices", vertices), ("edges", edges)):
        fields = [("id", S), ("label", S), ("properties_agtype", S)]
        if name == "edges":
            fields += [("source", S), ("target", S)]
        raw = [{k: row[k] for k, _ in fields} for row in rows]
        pq.write_table(pa.Table.from_pylist(raw, schema=pa.schema(fields)),
                       snapshot / f"{name}.parquet", compression="NONE")
    manifest = dict(graph=graph, exported_at=datetime.now(timezone.utc).isoformat(),
        database_access="REPEATABLE READ, READ ONLY; SELECT FROM ONLY label tables",
        vertex_labels=dict(Counter(v["label"] for v in vertices)),
        edge_labels=dict(Counter(e["label"] for e in edges)),
        artifacts=dict(entities=len(entities), relationships=len(relationships),
                       communities=len(communities), community_reports=len(reports)),
        membership_edges=sum(e["label"] == args.membership_label for e in edges),
        entity_labels=sorted({v["label"] for v in vertices} & set(pick_entity_labels(vertices, args.entity_labels, args.community_label))),
        warnings=warnings,
        scope="Viewer: relations between exported entities and community membership. Snapshot: every label.",
        viewer_adapter_required=["Preserve relationship type", "Use community entity_ids for membership", "Preserve level 0 and parent 0"])
    (args.output / "manifest.json").write_text(encode(manifest) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"Artifacts: {artifacts.resolve()}")


if __name__ == "__main__":
    main()
