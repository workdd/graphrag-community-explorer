# Changelog

## 0.2.0 (2026-09-08)

- Korean interface with a switch in the top bar; the choice is remembered.
- PNG export of graph and map at 2x, CSV export of the community and quality tables.
- Shareable view state in the URL (`#view=map&set=leiden&community=11`).
- Heavy views load on demand; the overview bundle is a third of the size.
- Claims (`covariates.parquet`) on the entity panel.
- Neighbourhood exploration: 1 to 3 hops around any entity, drawn inside its communities.
- GraphRAG 0.3 `create_final_*` sample and smoke test; stress set generator (`--scale`).
- Offline tools for Apache AGE export, Leiden runs and partition comparison.
- npm `bin` (`npx graphrag-community-explorer --data <folder>`), Dockerfile, release notes.

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
