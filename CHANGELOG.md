# Changelog

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
