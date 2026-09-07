# Sample dataset

`public/samples/demo/` holds a synthetic dataset in the Microsoft GraphRAG (>= 1.0) output layout:
`entities.parquet`, `relationships.parquet`, `communities.parquet`, `community_reports.parquet`.

It describes an invented e-commerce platform (services, data stores, queues, teams, vendors,
incidents) organized in three community levels: domains, areas, topics. Twenty "legacy" entities
belong to no community, and a couple of dozen entities have no relationships at all, so the coverage and integrity panels
have something to show.

Regenerate it with `uv run samples/generate_sample.py` (or `python3` with pyarrow installed).
The generator is deterministic (seed 7); ids are UUID5 values derived from titles.

Nothing in this folder comes from a real system. Keep it that way: real exports belong in
`public/data/` (ignored by Git) and are opened with `?data=./data/<folder>`.
