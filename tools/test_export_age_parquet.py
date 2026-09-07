"""convert() 단위 테스트. DB 없이 합성 AGE 스냅샷으로 변환 규칙을 검증한다.

실행: uv run --with 'psycopg[binary]>=3.2,<4' --with 'pyarrow>=18,<24' \
        --with 'python-dotenv>=1,<2' --with pytest python -m pytest tools -q
"""
import pyarrow as pa
import pytest

import export_age_parquet as m


def vertex(vid, label, **props):
    return dict(id=vid, label=label, properties=props, properties_agtype="{}")


def edge(eid, label, source, target, **props):
    return dict(id=eid, label=label, source=source, target=target,
                properties=props, properties_agtype="{}")


@pytest.fixture
def snapshot():
    vertices = [
        vertex("1", "Resource", name="web", kind="VirtualMachine"),
        vertex("2", "Resource", name="web", kind="VirtualMachine"),  # 동명 리소스
        vertex("3", "Resource", name="vol", kind="BlockStorage"),
        vertex("10", "Community", id="comm-a", level=0, parent_id=None,
               title="A", member_count=2, summary="요약 A"),
        vertex("11", "Community", id="comm-b", level=1, parent_id="comm-a",
               title="B", member_count=5),  # member_count 불일치, summary 없음
        vertex("20", "Facet", name="facet"),
    ]
    edges = [
        edge("100", "attachedToVM", "3", "1", method="authoritative"),
        edge("101", "inCommunity", "1", "10"),
        edge("102", "inCommunity", "2", "10"),
        edge("103", "inCommunity", "3", "11"),
        edge("104", "inFacet", "1", "20"),  # Resource 간 관계가 아니므로 제외
    ]
    return vertices, edges


def test_entities_keep_duplicate_names_distinct(snapshot):
    entities, *_ = m.convert(*snapshot, graph="g")
    titles = [e["title"] for e in entities]
    assert len(entities) == 3 and len(set(titles)) == 3
    assert titles[0] == "VirtualMachine · web [AGE:1]"
    assert [e["type"] for e in entities] == ["VirtualMachine", "VirtualMachine", "BlockStorage"]


def test_relationships_keep_age_label_and_join_by_title(snapshot):
    entities, relationships, *_ = m.convert(*snapshot, graph="g")
    by_id = {e["id"]: e["title"] for e in entities}
    assert len(relationships) == 1
    rel = relationships[0]
    assert rel["type"] == "attachedToVM"
    assert (rel["source"], rel["target"]) == (by_id["3"], by_id["1"])
    assert rel["weight"] == 1.0 and rel["combined_degree"] == 2


def test_communities_use_membership_edges_and_keep_zero_values(snapshot):
    _, _, communities, reports, warnings = m.convert(*snapshot, graph="g")
    a, b = communities
    assert (a["community"], a["level"], a["parent"]) == (0, 0, -1)
    assert a["entity_ids"] == ["1", "2"] and a["size"] == 2
    assert a["relationship_ids"] == []  # 3→1 간선은 3이 A 소속이 아니므로 내부 간선이 아님
    assert (b["community"], b["level"], b["parent"]) == (1, 1, 0)
    assert b["entity_ids"] == ["3"]
    assert [r["community"] for r in reports] == [0] and reports[0]["summary"] == "요약 A"
    assert warnings == ["Community comm-b: stored member_count=5, actual=1"]


def test_rows_match_parquet_schemas(snapshot):
    entities, relationships, communities, reports, _ = m.convert(*snapshot, graph="g")
    for name, rows in zip(m.SCHEMAS, (entities, relationships, communities, reports)):
        table = pa.Table.from_pylist(rows, schema=m.SCHEMAS[name])
        assert table.to_pylist() == rows


def test_dangling_edge_is_rejected(snapshot):
    vertices, edges = snapshot
    with pytest.raises(ValueError, match="Dangling edge"):
        m.convert(vertices, edges + [edge("105", "attachedToVM", "1", "999")], graph="g")


def test_duplicate_community_business_id_is_rejected(snapshot):
    vertices, edges = snapshot
    dup = vertex("12", "Community", id="comm-a", level=0, title="A2")
    with pytest.raises(ValueError, match="Community.id"):
        m.convert(vertices + [dup], edges, graph="g")
