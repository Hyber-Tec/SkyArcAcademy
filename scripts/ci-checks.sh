#!/usr/bin/env bash
# CI's "Typecheck, tests and builds", in two lanes side by side (the runner has four cores): the typecheck, the longest,
# in one; the unit tests, lint and builds one after another in the other. The website's build here is Vite's alone, as
# the typecheck lane runs its `tsc -b`. Each check's output is printed whole with its time (folded when it passed), and
# the step fails if any check failed, naming it. Run it from the repository root, after the installs.
set -uo pipefail
logs=$(mktemp -d)
NAMES=("Typecheck" "Unit tests" "Lint" "Build the website" "Build the functions")

check() {
  local start=$SECONDS
  bash -c "$2" >"$logs/$1.log" 2>&1
  echo "$? $((SECONDS - start))" >"$logs/$1.end"
}

check "Typecheck" "npm run typecheck" &
typecheck=$!
check "Unit tests" "npm test"
check "Lint" "npm run lint"
check "Build the website" "cd web && npx --no-install vite build"
check "Build the functions" "npm --prefix functions run build"
wait "$typecheck"

failed=()
for name in "${NAMES[@]}"; do
  read -r code secs <"$logs/$name.end"
  if [ "$code" = 0 ]; then
    echo "::group::$name: passed in ${secs}s"
    cat "$logs/$name.log"
    echo "::endgroup::"
  else
    echo "── $name: FAILED after ${secs}s ──"
    cat "$logs/$name.log"
    failed+=("$name")
  fi
done
if [ ${#failed[@]} -gt 0 ]; then
  printf -v list '%s, ' "${failed[@]}"
  echo "::error::Failed: ${list%, }"
  exit 1
fi
