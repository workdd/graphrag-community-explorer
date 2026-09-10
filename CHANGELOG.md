# Changelog

## 0.4.0 (2026-09-10)

- **Health**: the quality numbers stated as named problems. Entities no community claims, one
  community swallowing a level, communities global search cannot read, modularity that says the
  grouping does not follow the graph, descriptions too thin to rank on, a hub the whole graph hangs
  off, no source text, no vectors. Each says what it costs a search and what to change upstream, and
  the tab carries the count so an index announces its own defects without being opened. Every
  threshold is named in the source with the reason it is where it is.
- The views are grouped by what you came to do, and renamed so they can be told apart: Overview is
  Health, Schema is Types, Network is Graph, and the community graph is Focus. The strip is now one
  keyboard stop with arrow keys between views, and each view names the panel it opens; before this
  it claimed a tab pattern it did not implement.
- A first visit is pointed once at the tab that answers something.
- The Ask tab keeps its question, its answer and the record it had open when you leave it. Following
  an answer into a community and coming back no longer costs the question, or the money to ask it
  again. Another index gets its own state, and a reload starts clean.

## 0.3.0 (2026-09-09)

- A folder may carry an `example-run.json`, and the Ask tab offers it as one click. The shipped
  sample has one, so the demo answers a question, resolves its citations and draws its evidence
  graph without an API key.
- Ask tab: local and global search against any OpenAI-compatible provider. The key stays in the
  browser, never in a saved run; `VITE_LLM_*` supplies the defaults and the build refuses to
  publish an inlined key unless `ALLOW_EMBEDDED_KEY=1`.
- Every citation in an answer opens the record it names, beside the answer and without leaving the
  tab. The evidence graph outlines the cited records in red and lists the retrieved ones with their
  scores, so what the model ignored is as visible as what it used.
- The embedding space plots the question and the entity vectors (PCA, 2D or 3D), marking what went
  into the prompt and what the token budget cut.
- "How a question reaches an answer" draws the run itself with the counts and milliseconds it
  spent, and "Show the prompt sent to the model" prints the messages verbatim.
- Runs can be saved as a trace file and read back on a machine with no key.
- Example questions are derived from the loaded data, named with their schema type.
- `tools/embed_index` writes the `embeddings.parquet` sidecar local search needs, with the model,
  the dimension and a SHA-256 of every source file in the file's metadata.
- The app opens on the schema view: entity types, the relationships between them, and the Parquet
  tables with their key and reference columns.
- Browser back and forward move between views and selections; neighbourhood mode is in the URL.
- Big communities start with their dominant hub relationship type hidden; leaves of one type on
  one hub fold into a single node; dense graphs draw links fainter until one is selected.
- Communities can be shown as clouds around their members (graph, neighbourhood, map).

## 0.2.0 (2026-09-08)

- Korean interface with a switch in the top bar; the choice is remembered.
- PNG export of graph and map at 2x, CSV export of the community and quality tables.
- Shareable view state in the URL (`#view=map&set=leiden&community=11`).
- Heavy views load on demand; the overview bundle is a third of the size.
- Claims (`covariates.parquet`) on the entity panel.
- Neighbourhood exploration: 1 to 3 hops around any entity, drawn inside its communities.
- GraphRAG 0.3 `create_final_*` sample and smoke test; stress set generator (`--scale`).
- Offline tools for Apache AGE export, Leiden runs and partition comparison.
- npm `bin` that serves a built copy next to an index folder, Dockerfile, release notes.

## 0.1.0 (2026-09-08)

First public release.

- Loads Microsoft GraphRAG Parquet output (0.3 to 2.x file names) and Apache AGE exports in the
  same layout; extra `<label>_communities.parquet` files become switchable community sets.
- Overview: hierarchy tree, summary, sortable community table, report inspector, integrity checks.
- Community graph: members inside the community container, type colors, degree-scaled nodes,
  readable labels, outside links to ghost nodes, neighbourhood focus, relationship-type filter.
- Community map: the whole dataset as community boxes with weighted links; nested hierarchies open
  in place; entities in no community form their own box; layout in a web worker with caching.
- Quality: modularity and coverage per level, size distributions, density and conductance per
  community, NMI/ARI comparison of two community sets.
- Evidence: text units and documents behind entities, relationships and communities.
- Synthetic sample dataset, Playwright smoke test, pre-push and post-build data checks.
