# Offline tools

Python scripts that produce GraphRAG-layout Parquet from other sources and analyse community sets.
They never write to the source database. Run them with [uv](https://docs.astral.sh/uv/) so the
dependencies declared at the top of each file are installed on the fly.

| Script | Purpose |
| --- | --- |
| `export_age_parquet.py` | Reads an Apache AGE graph (Resource / Community / inCommunity labels) and writes `entities`, `relationships`, `communities`, `community_reports` Parquet plus a raw snapshot of every label. |
| `recluster_communities.py` | Runs Leiden over every connected component of an exported index at a ladder of resolutions and writes `<label>_communities.parquet` plus `entity_membership.parquet`. Clustering only the largest component leaves the rest unassigned: on the resource graph that is the difference between 64 % and 78 % coverage. |
| `compare_community_partitions.py` | NMI / ARI between the stored communities and a Leiden run, with an overlap table. Reads the `entity_membership.parquet` the reclustering wrote. The app's Quality tab does the same on loaded files. |
| `summarize_communities.py` | Writes `<label>_community_reports.parquet` for a community set that has none. Global search reads summaries and nothing else, so a set without them is invisible to it. |
| `embed_index/` | Writes the entity-embedding sidecar the Ask tab needs for local search. |
| `test_export_age_parquet.py` | Unit tests for the AGE converter (synthetic snapshot, no database). |

## Apache AGE export

```sh
cp .env.example .env.age   # then fill AGE_HOST, AGE_PORT, AGE_DB, AGE_USER, AGE_PASSWORD, AGE_GRAPH
uv run tools/export_age_parquet.py --env-file .env.age --output local-data/age
uv run tools/export_age_parquet.py --env-file .env.age --graph other_graph --output local-data/other
```

| Flag | Meaning |
| --- | --- |
| `--entity-labels` | Vertex labels to export as entities. `auto` (default) uses `Resource` when the graph has it, and otherwise every vertex label except the community one, which is what graphs that label vertices by kind (`User`, `Role`, `Menu`) need. |
| `--community-label` | Vertex label holding communities. Default `Community`. |
| `--membership-label` | Edge label from a member to its community. Default `inCommunity`. |

A community references its parent through `parent_id` or `parentId`, by the full business id or by
a suffix of it (`L1:14` for `community:gov:L1:14`). Its title comes from `title`, `hub_name` or
`name`; when the producer wrote none, the leading kind names of a `kinds` census are used.

Connection settings are read from the env file or the environment; nothing is hard-coded. The
export runs in a `READ ONLY`, `REPEATABLE READ` transaction. Output goes to a new directory only.

Vertices need `name` and `kind` to read well; communities need `id` and `level`. Every edge between
two exported entities becomes a relationship of that edge's label.

## Tests

```sh
uv run --with 'psycopg[binary]>=3.2,<4' --with 'pyarrow>=18,<24' --with 'python-dotenv>=1,<2' --with pytest python -m pytest tools -q
```

## Community sets

```sh
uv run tools/recluster_communities.py --index local-data/age --report-only     # graph shape only
uv run tools/recluster_communities.py --index local-data/age                    # write the partition
```

Add the file it writes to `manifest.json` so a hosted folder serves it; the viewer then offers it as
a switchable community set next to the one the index shipped.

Measured on the resource graph (2,674 entities, 4,580 relationships):

| Approach | Communities | Assigned | Coverage | Modularity |
| --- | --- | --- | --- | --- |
| Pipeline that produced the index | 41 | 1,208 | 45 % | not recorded |
| Leiden on the largest component only | 38 | 1,713 | 64 % | 0.50–0.53 |
| Leiden over every component, hubs folded | 34–46 | 2,071 | 77 % | 0.44 |
| Leiden over every component | 34–43 | 2,089 | 78 % | 0.59–0.60 |

78 % is the ceiling: 585 entities (22 %) have no relationship at all and no topological method can
place them. Raising the resolution changes granularity, not coverage: modularity peaks near 1.0 and
falls to 0.49 by the time the count reaches 191.

## Summaries for a recomputed set

A community set produced by `recluster_communities.py` carries members but no summaries, and global
search reads summaries and nothing else. Without this step the set shows in the viewer and stays
invisible to the Ask tab.

```sh
export LLM_API_KEY=...
uv run tools/summarize_communities.py --index local-data/age --set recluster --check
uv run tools/summarize_communities.py --index local-data/age --set recluster
```

It writes after every community, so an interrupted run resumes where it stopped. The summary
language follows the index's own reports unless `--language` says otherwise, and each prompt carries
only the relationships whose two ends are both inside that community: passing the index's whole list
made the model describe links the community does not have.

Measured on the resource graph, asking the same question of each set:

| Set | Reports | Batches | Calls | Tokens | Elapsed |
| --- | --- | --- | --- | --- | --- |
| Communities (the index's own) | 41 | 1 | 2 | 3,790 + 1,127 | 8.4 s |
| recluster | 119 | 4 | 5 | 13,598 + 2,553 | 27.3 s |

Wider coverage costs proportionally more, because global search sends every report at the level.
