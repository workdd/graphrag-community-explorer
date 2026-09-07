# Product architecture

GraphRAG Community Explorer is organized as four independent layers:

1. **Adapters** convert Apache AGE, GraphRAG Parquet, and future graph stores into a common snapshot contract.
2. **Analysis** computes hierarchical Leiden, quality metrics, partition comparison, and data-quality findings offline.
3. **Views** render community summaries first, then lazy-load a selected community's internal graph.
4. **Export** writes sanitized Parquet/JSON artifacts. Raw AGE exports and credentials are never committed.

## UX contract

- The first screen renders communities, not thousands of resources.
- Selecting a community opens its internal graph in a separate view.
- Hierarchy is shown as an explicit tree; it is not inferred from force-layout positions.
- Every visual encoding has a legend and can be filtered.
- Layout coordinates are deterministic and computed before rendering.

## Performance budgets

- Initial map: <= 200 community containers.
- Internal graph: <= 500 nodes by default, with explicit sampling for larger groups.
- No browser force simulation over the full AGE snapshot.
- Layout and community detection run offline or in a worker.

The current `GraphViewer` and `CommunityMap` are retained as legacy experiments while the product views are rebuilt against this contract.
