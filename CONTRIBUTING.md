# Contributing

Thanks for helping. This page is the whole process; there is nothing hidden in a wiki.

## Set up

```sh
git clone https://github.com/workdd/graphrag-community-explorer.git
cd graphrag-community-explorer
npm install
npm run hooks        # pre-push check that refuses private data
npm run dev          # http://127.0.0.1:5173
```

Put a real GraphRAG index under `local-data/<name>/` and open `?data=./data/<name>`. That folder is
ignored by Git and never copied into a build.

## Before you push

```sh
npm run typecheck
npm test
npm run e2e          # needs Google Chrome installed, or set CI=1 after `npx playwright install chromium`
npm run build
```

The pre-push hook runs `scripts/check-sensitive.sh`. If it stops you, the commit contains a data
file, an environment file or an identifier from a private export; move the data out and amend.

## What goes where

- `src/core`: pure TypeScript. Data contract, loaders, hierarchy, metrics, map model, evidence.
  Everything here has a vitest suite next to it and must stay free of DOM and React imports.
- `src/ui`: React views. They import from `src/core` only.
- `src/workers`: layout worker. Anything it imports must run without a DOM.
- `samples/`: the synthetic sample generator. `public/samples/demo` is its output; regenerate rather
  than edit.
- `docs/`: roadmap and screenshots. Screenshots come from the sample dataset only.

## Pull requests

- One milestone or one fix per pull request, with the tests that cover it.
- Numbers shown on screen are derived from the loaded files. If you add a number, add a test that
  computes it from a small fixture.
- Keep the UI copy in the tone of the existing screens: sentence case, plain verbs, no exclamation
  marks.
- Screenshots in the description are welcome; take them on the sample dataset.

## Reporting a problem

Open an issue with the template. Include the GraphRAG version that produced the index, the file names
you loaded, and what the integrity panel said. Do not attach real index files; describe their shape
or reproduce the problem with `samples/generate_sample.py`.
