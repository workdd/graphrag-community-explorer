# Explorer preview

Run `npm ci`, then `npm start`, and open `#/explore` on the development server.
The entry point renders `src/explorer/Explorer.tsx` directly. It does not mount the legacy application or its analytics.

Put local `entities.parquet`, `relationships.parquet`, and `communities.parquet` in `public/artifacts`. Optionally add `leiden_communities.parquet`. These files are ignored by Git. Never include them in public build/deployment artifacts: files under public are copied to the build output even when Git ignores them.

The loader respects the configured PUBLIC_URL, including subdirectory hosting. With no local files, the connection screen offers an entirely synthetic sample dataset.

Current preview supports community search, level selection, operational/Leiden switching, member tables, and a bounded internal relationship map. The map shows the first 80 members and only edges with both endpoints visible; it is not a whole-community quality metric. It uses fixed placement, not a force simulation.

Known limitations: hierarchy validation and true recursive Leiden are not implemented here. Existing resolution-ladder files must not be described as a validated hierarchical partition. The local operational file may be older than the current database; refresh it explicitly before comparing algorithms. Public release needs adapter validation, dataset import, browser interaction tests, and release packaging.
