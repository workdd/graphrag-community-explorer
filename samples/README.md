# Sample dataset

`public/samples/demo/` holds a synthetic dataset in the Microsoft GraphRAG (>= 1.0) output layout:
`entities.parquet`, `relationships.parquet`, `communities.parquet`, `community_reports.parquet`,
`text_units.parquet`, `documents.parquet`.

It describes an invented e-commerce platform (services, data stores, queues, teams, vendors,
incidents) organized in three community levels: domains, areas, topics. Twenty "legacy" entities
belong to no community, and a couple of dozen entities have no relationships at all, so the coverage and integrity panels
have something to show.

Regenerate it with `uv run samples/generate_sample.py` (or `python3` with pyarrow installed).
The generator is deterministic (seed 7); ids are UUID5 values derived from titles.

Nothing in this folder comes from a real system. Keep it that way: real exports belong in
`public/data/` (ignored by Git) and are opened with `?data=./data/<folder>`.

`public/samples/legacy/` is the same data written with GraphRAG 0.3 file names and columns
(`create_final_*`, entity `name`, no `entity_ids`, no parents): `uv run samples/generate_sample.py --legacy-names --out public/samples/legacy`.
For a stress set that stays out of Git: `uv run samples/generate_sample.py --scale 53 --edge-factor 5 --out local-data/stress`.
