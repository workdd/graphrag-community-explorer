#!/usr/bin/env bash
# Builds the app and publishes dist/ to the gh-pages branch as a fresh snapshot.
# The build step already refuses any dataset but the sample (scripts/check-dist.mjs).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
remote=${1:-$(git remote get-url origin)}
npm run build
touch dist/.nojekyll
tmp=$(mktemp -d)
cp -R dist/. "$tmp"
(
  cd "$tmp"
  git init -q
  git checkout -q -b gh-pages
  git add -A
  git -c user.name="deploy" -c user.email="deploy@localhost" commit -q -m "deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push -f "$remote" gh-pages:gh-pages
)
rm -rf "$tmp"
echo "published dist/ to gh-pages on $remote"
