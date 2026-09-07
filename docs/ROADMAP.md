# Roadmap

The goal is a viewer that anyone with GraphRAG output can use to understand how their communities
are built. Apache AGE is one input adapter among several, not the center of the product.

## Principles

- Communities first. The opening screen is a hierarchy and a table, never a hairball.
- Graphs are deterministic: the same data and filters produce the same picture, computed off the
  main thread and cached.
- Every count on screen is derived from the loaded files and can be checked against them.
- Real data never enters the repository; screenshots use the synthetic sample only.

## Milestones

| Milestone | Scope | Done when |
| --- | --- | --- |
| M0 Foundation (done) | Vite app, data contract, GraphRAG and AGE-export loaders, synthetic sample, integrity checks, overview, hierarchy tree, community table, inspector, CI, pre-push data check | Sample and a real GraphRAG index both load; counts match an independent script; CI is green |
| M1 Internal graph (done) | Community view with a Cytoscape fcose layout of the selected community: type colors, always-on labels without overlap, neighbour highlighting, relationship-type filter, boundary edges dimmed, "expand neighbouring community" | A 200-entity community renders in under two seconds with readable labels; smoke test in Playwright |
| M2 Community map (done) | Whole dataset as nested compound containers (level 0 ⊃ level 1 ⊃ level 2) with expand/collapse, inter-community edges bundled by weight, layout in a worker and cached per dataset hash | 2,500 entities: collapsed map in one second, one expanded community in two; identical layout on reload |
| M3 Quality and evidence (done) | Per-community conductance and density, size distributions, comparison of two partitions (NMI, ARI, crosstab), text units and documents behind entities and relationships | Metrics match reference implementations on the sample; evidence opens for every GraphRAG 2.x index |
| M4 Release (current) | README in English and Korean, GitHub Pages demo on the sample, CONTRIBUTING, issue templates, CHANGELOG, `npx` launcher | A newcomer follows the README and explores their own index without asking questions |

## Out of scope for now

Running Leiden in the browser (offline tools cover it), live database connections, editing
communities, and hosted multi-user deployments.
