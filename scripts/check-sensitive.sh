#!/usr/bin/env bash
# Refuses to publish local data. Runs as the pre-push hook (npm run hooks) and in CI.
# Checks tracked files only, so stage what you mean to ship before pushing.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
status=0

data_files=$(git ls-files | grep -E '\.(parquet|arrow|feather|age\.json|snapshot\.json)$' | grep -vE '^public/samples/' || true)
if [ -n "$data_files" ]; then
  echo "Data files tracked outside public/samples/:"; echo "$data_files"; status=1
fi

env_files=$(git ls-files | grep -E '(^|/)\.env(\..+)?$' | grep -vE '\.example$' || true)
if [ -n "$env_files" ]; then
  echo "Environment files tracked:"; echo "$env_files"; status=1
fi

# Identifiers that only occur in private exports: AGE graph ids, private network
# ranges, credential variables.
pattern='844424930[0-9]{6}|(10|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]+\.[0-9]+\.[0-9]+|AGE_PASSWORD=[^ ]|PGPASSWORD='
hits=$(git grep -n -I -E "$pattern" -- . ':!scripts/check-sensitive.sh' ':!package-lock.json' || true)
if [ -n "$hits" ]; then
  echo "Private identifiers found:"; echo "$hits"; status=1
fi

if [ "$status" -eq 0 ]; then echo "check-sensitive: clean"; fi
exit "$status"
