# Security

## What this application does with your data

Browsing is local. The Parquet files you open are parsed in the browser tab; nothing is uploaded and
there is no backend to upload to. The hosted demo is a static site.

The **Ask** tab is the exception and says so on the screen. Asking a question sends the evidence
that was selected for the prompt, and the question itself, to the model provider you configured. The
request goes from your browser straight to that provider's endpoint. Which records were sent is
listed on the same screen, and **Show the prompt sent to the model** prints them verbatim before you
have to take anyone's word for it.

## What happens to your API key

- It is kept in that browser's local storage, under `graphrag-explorer.provider`, and nowhere else.
- It is never written into a saved run. The settings a trace records are whitelisted (the two model
  names and the budget numbers); the key and the base URL are not in the list.
- It is never logged. A failed call is reported by kind (`auth`, `rate`, `server`, `network`) plus
  whatever error text the provider itself returned. The request that was sent, headers included, is
  not echoed anywhere.
- **Forget the key** clears it. On a shared computer, use that.

`VITE_LLM_API_KEY` in a `.env` file is a convenience for local development only. Vite inlines every
`VITE_*` value into the bundle, so a build carrying one publishes it to anyone who can read the
built files. `scripts/check-dist.mjs` fails the build in that case unless `ALLOW_EMBEDDED_KEY=1`
states the intent. The published demo is built without a key, and that is checked after every build.

## Keeping private indexes out of the repository

Two checks run over this repository:

- `scripts/check-sensitive.sh` (in CI, and before every push once `npm run hooks` is installed)
  refuses data files outside `public/samples/`, environment files, and identifiers that only occur
  in private exports.
- `scripts/check-dist.mjs` (after every build) fails if `dist/` would publish any dataset but the
  synthetic sample, or an inlined provider key.

Real indexes belong in `local-data/`, which Git ignores and the build never copies.

## Reporting a vulnerability

Open a [security advisory](https://github.com/workdd/graphrag-community-explorer/security/advisories/new)
rather than a public issue, and please include the version or commit, the browser, and what an
attacker would gain. This is a client-side application with no accounts and no server-side state, so
the interesting cases are the ones where data leaves the tab: a path that puts index content or a
key somewhere it was not meant to go.

Expect a first reply within a week. There is no bounty programme.
