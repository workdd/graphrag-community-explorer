# Offline tools

Python scripts that produce GraphRAG-layout Parquet from other sources and analyse community sets.
They never write to the source database. Run them with [uv](https://docs.astral.sh/uv/) so the
dependencies declared at the top of each file are installed on the fly.

| Script | Purpose |
| --- | --- |
| `export_age_parquet.py` | Reads an Apache AGE graph (Resource / Community / inCommunity labels) and writes `entities`, `relationships`, `communities`, `community_reports` Parquet plus a raw snapshot of every label. |
| `run_leiden_communities.py` | Projects Resource relationships to an undirected weighted graph and runs Leiden at several resolutions; writes a `communities.parquet` you can load as an extra partition (rename to `leiden_communities.parquet`). |
| `compare_community_partitions.py` | NMI / ARI between the stored communities and a Leiden run, with an overlap table. The app's Quality tab does the same on loaded files. |
| `test_export_age_parquet.py` | Unit tests for the AGE converter (synthetic snapshot, no database). |

## Apache AGE export

```sh
cp .env.example .env.age   # then fill AGE_HOST, AGE_PORT, AGE_DB, AGE_USER, AGE_PASSWORD, AGE_GRAPH
uv run tools/export_age_parquet.py --env-file .env.age --output local-data/age
```

Connection settings are read from the env file or the environment; nothing is hard-coded. The
export runs in a `READ ONLY`, `REPEATABLE READ` transaction. Output goes to a new directory only.

Expected AGE schema: `Resource` vertices with `name`, `kind`; `Community` vertices with `id`,
`title`, `level`, `parent_id`, `summary`; `inCommunity` edges from Resource to Community; any other
edge label between Resources becomes a relationship of that type.

## Tests

```sh
uv run --with 'psycopg[binary]>=3.2,<4' --with 'pyarrow>=18,<24' --with 'python-dotenv>=1,<2' --with pytest python -m pytest tools -q
```
