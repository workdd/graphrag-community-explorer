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


def test_duplicate_report_names_the_nodes_so_the_loader_can_be_fixed(snapshot):
    """어느 id 가 겹쳤는지 말하지 않으면 적재기를 고칠 수가 없다."""
    vertices, edges = snapshot
    dup = vertex("12", "Community", id="comm-a", level=0, title="A2")
    with pytest.raises(ValueError) as caught:
        m.convert(vertices + [dup], edges, graph="g")
    message = str(caught.value)
    assert "comm-a" in message
    assert "node 12" in message
    assert "'A2'" in message
    assert "--allow-duplicate-ids" in message


def test_missing_community_id_names_the_node(snapshot):
    vertices, edges = snapshot
    blank = vertex("12", "Community", level=0, title="No id")
    with pytest.raises(ValueError, match="missing on nodes: 12"):
        m.convert(vertices + [blank], edges, graph="g")


def test_allowing_duplicates_keeps_the_first_node_and_warns(snapshot):
    vertices, edges = snapshot
    dup = vertex("12", "Community", id="comm-a", level=0, title="A2")
    before = m.convert(vertices, edges, graph="g")
    after = m.convert(vertices + [dup], edges, graph="g", allow_duplicate_ids=True)
    assert len(after[2]) == len(before[2])
    assert [c["title"] for c in after[2]] == [c["title"] for c in before[2]]
    warning = " ".join(after[4])
    assert "comm-a" in warning and "dropped 1" in warning


def test_allowing_duplicates_keeps_membership_of_the_node_that_stays(snapshot):
    vertices, edges = snapshot
    dup = vertex("12", "Community", id="comm-a", level=0, title="A2")
    stray = edge("e-dup", "inCommunity", "1", "12")
    communities = m.convert(vertices + [dup], edges + [stray], graph="g", allow_duplicate_ids=True)[2]
    kept = [c for c in communities if c["title"] == "A"]
    assert len(kept) == 1
    assert kept[0]["entity_ids"] == m.convert(vertices, edges, graph="g")[2][0]["entity_ids"]


@pytest.fixture
def kind_labelled():
    """kind 별로 정점 라벨이 나뉘고 부모를 접미사 키로 가리키는 그래프 (거버넌스 형태)."""
    vertices = [
        vertex("1", "User", id="u-1", name="신준영", kind="User"),
        vertex("2", "Role", id="r-1", name="관리자", kind="Role"),
        vertex("3", "Menu", id="m-1", name="대시보드", kind="Menu"),
        vertex("10", "Community", id="community:gov:L0:0", level=0,
               kinds="User 2 · Role 1", member_count=3),
        vertex("11", "Community", id="community:gov:L1:4", level=1, parentId="L0:0",
               kinds="Menu 1", member_count=1),
    ]
    edges = [
        edge("100", "hasRole", "1", "2"),
        edge("101", "grantsFull", "2", "3"),
        edge("102", "inCommunity", "1", "10"),
        edge("103", "inCommunity", "2", "10"),
        edge("104", "inCommunity", "3", "11"),
    ]
    return vertices, edges


def test_every_vertex_label_becomes_an_entity_when_there_is_no_resource(kind_labelled):
    entities, relationships, *_ = m.convert(*kind_labelled, graph="cmp_gov")
    assert [e["type"] for e in entities] == ["User", "Role", "Menu"]
    assert entities[0]["title"] == "User · 신준영 [AGE:1]"
    assert entities[0]["age_label"] == "User"
    assert [r["type"] for r in relationships] == ["hasRole", "grantsFull"]


def test_parent_resolves_through_a_suffix_key_and_title_falls_back_to_kinds(kind_labelled):
    _, _, communities, _, _ = m.convert(*kind_labelled, graph="cmp_gov")
    assert [c["community"] for c in communities] == [0, 1]
    assert [c["parent"] for c in communities] == [-1, 0]
    # 이름이 없으면 kinds 에 가장 연결이 많은 멤버와 크기를 붙여 부모·자식이 구분된다.
    assert [c["title"] for c in communities] == ["User / Role · 관리자 +1", "Menu · 대시보드"]
    assert [c["level"] for c in communities] == [0, 1]


def test_entity_labels_can_be_named_explicitly(kind_labelled):
    entities, relationships, *_ = m.convert(*kind_labelled, graph="cmp_gov", entity_labels="User,Role")
    assert [e["type"] for e in entities] == ["User", "Role"]
    # Menu is not an entity, so the edge that ends there is not a relationship.
    assert [r["type"] for r in relationships] == ["hasRole"]
    with pytest.raises(ValueError, match="not in the graph"):
        m.convert(*kind_labelled, graph="cmp_gov", entity_labels="Nope")


def test_resource_graphs_keep_the_previous_behaviour(snapshot):
    entities, *_ = m.convert(*snapshot, graph="g")
    # the Facet vertex is still excluded because Resource is present
    assert [e["age_label"] for e in entities] == ["Resource"] * 3


def test_derived_titles_name_the_busiest_member_and_stay_unique():
    """커뮤니티 이름이 없을 때 kinds 만 쓰면 부모와 자식이 같은 이름이 된다."""
    vertices = [
        vertex("1", "Role", id="r1", name="시스템총괄관리", kind="Role"),
        vertex("2", "Menu", id="m1", name="대시보드", kind="Menu"),
        vertex("3", "Menu", id="m2", name="설정", kind="Menu"),
        vertex("10", "Community", id="c:L0:0", level=0, kinds="Menu 2 · Role 1"),
        vertex("11", "Community", id="c:L1:0", level=1, parentId="L0:0", kinds="Menu 2 · Role 1"),
    ]
    edges = [
        edge("100", "grants", "1", "2"), edge("101", "grants", "1", "3"),
        edge("102", "inCommunity", "1", "10"), edge("103", "inCommunity", "2", "10"), edge("104", "inCommunity", "3", "10"),
        edge("105", "inCommunity", "1", "11"), edge("106", "inCommunity", "2", "11"),
    ]
    _, _, communities, _, _ = m.convert(vertices, edges, graph="g")
    titles = [c["title"] for c in communities]
    assert titles[0] == "Menu / Role · 시스템총괄관리 +2"
    assert titles[1] == "Menu / Role · 시스템총괄관리 +1"
    assert len(set(titles)) == 2


def test_identical_derived_titles_get_the_community_number():
    vertices = [
        vertex("1", "Role", id="r1", name="같은이름", kind="Role"),
        vertex("10", "Community", id="c:a", level=0, kinds="Role 1"),
        vertex("11", "Community", id="c:b", level=0, kinds="Role 1"),
    ]
    edges = [edge("102", "inCommunity", "1", "10"), edge("103", "inCommunity", "1", "11")]
    _, _, communities, _, _ = m.convert(vertices, edges, graph="g")
    assert sorted(c["title"] for c in communities) == ["Role · 같은이름 #0", "Role · 같은이름 #1"]


def test_a_producer_title_is_never_replaced(snapshot):
    _, _, communities, _, _ = m.convert(*snapshot, graph="g")
    assert [c["title"] for c in communities] == ["A", "B"]


def test_split_parent_keys_handles_the_shapes_producers_use():
    assert m.split_parent_keys("L1:0 · L1:1") == ["L1:0", "L1:1"]
    assert m.split_parent_keys(["L1:0", "L1:1"]) == ["L1:0", "L1:1"]
    assert m.split_parent_keys("L1:0, L1:1; L1:2|L1:3") == ["L1:0", "L1:1", "L1:2", "L1:3"]
    assert m.split_parent_keys("L1:0") == ["L1:0"]
    assert m.split_parent_keys(None) == []
    assert m.split_parent_keys("") == []


@pytest.fixture
def straddler():
    """자식 하나가 부모 둘에 걸쳐 있는 그래프. 거버넌스에서 실제로 나온 모양이다."""
    vertices = [
        vertex("1", "Resource", name="a", kind="K"),
        vertex("2", "Resource", name="b", kind="K"),
        vertex("3", "Resource", name="c", kind="K"),
        vertex("10", "Community", id="comm-p1", level=0, title="P1"),
        vertex("11", "Community", id="comm-p2", level=0, title="P2"),
        vertex("12", "Community", id="comm-child", level=1, title="C", parentIds="comm-p1 · comm-p2"),
    ]
    edges = [
        edge("m1", "inCommunity", "1", "10"), edge("m2", "inCommunity", "2", "10"),
        edge("m3", "inCommunity", "3", "11"),
        edge("m4", "inCommunity", "1", "12"), edge("m5", "inCommunity", "2", "12"),
        edge("m6", "inCommunity", "3", "12"),
    ]
    return vertices, edges


def test_a_child_with_two_parents_joins_the_one_that_holds_most_of_it(straddler):
    vertices, edges = straddler
    communities, warnings = m.convert(vertices, edges, graph="g")[2], m.convert(vertices, edges, graph="g")[4]
    child = next(c for c in communities if c["title"].startswith("C"))
    p1 = next(c for c in communities if c["title"].startswith("P1"))
    assert child["parent"] == p1["community"]
    assert any("comm-child" in w and "dropped" in w for w in warnings)


def test_the_dropped_parents_are_named_so_nothing_disappears_quietly(straddler):
    vertices, edges = straddler
    warnings = m.convert(vertices, edges, graph="g")[4]
    line = next(w for w in warnings if "comm-child" in w)
    assert "comm-p1" in line and "comm-p2" in line
    assert "2 of its 3 members" in line or "holds 2" in line


def test_a_child_named_only_in_the_plural_field_still_gets_a_parent(straddler):
    vertices, edges = straddler
    single = [v for v in vertices if v["id"] != "12"]
    single.append(vertex("12", "Community", id="comm-child", level=1, title="C", parentIds="comm-p1"))
    communities = m.convert(single, edges, graph="g")[2]
    child = next(c for c in communities if c["title"].startswith("C"))
    p1 = next(c for c in communities if c["title"].startswith("P1"))
    assert child["parent"] == p1["community"]
