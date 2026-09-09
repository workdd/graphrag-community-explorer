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
| M4 Release (done) | README in English and Korean, GitHub Pages demo on the sample, CONTRIBUTING, issue templates, CHANGELOG, `npx` launcher | A newcomer follows the README and explores their own index without asking questions |

| M5 Usability (done) | Korean/English interface, PNG and CSV export, shareable view URLs, lazy-loaded views, keyboard navigation for tree and tables | Every screen reads in both languages; smoke test covers the switch |
| M6 Scale and compatibility (done) | 10k-entity synthetic stress set with measured load, graph and map timings; GraphRAG 0.3 `create_final_*` sample tested end to end; covariates (claims) shown; n-hop neighbourhood exploration from any entity | 10k entities load under five seconds, collapsed map under two; 0.3 sample passes the smoke test |
| M7 Distribution (done) | npm package with a `bin` that serves a built copy next to your index; GitHub releases with notes; Dockerfile for static hosting | `npm pack` contains only dist and bin; a release page exists for each tag |
| M8 Ask (current) | Local and global search against an OpenAI-compatible provider; citations that open the record they name; evidence graph, embedding space and a picture of the run itself; saved traces; entity-embedding sidecar tool | A question answered from the shipped sample end to end, with every citation resolving to a record; no key reaches a trace, a log or a build |

## Out of scope for now

Live database connections, editing communities, and hosted multi-user deployments. DRIFT search,
dynamic community selection and prompt tuning are deliberately deferred until the two methods that
exist have been measured on real indexes.
