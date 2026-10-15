#!/usr/bin/env bash
# Fails when the repository tracks client material or a secret (CLAUDE.md, "Secrets"). Real students' SIUS reports,
# target photos and schedules stay on Goo's Mac mini; parser and upload tests use synthetic files in tests/fixtures/.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
status=0

# Report PDFs and photos: only synthetic fixtures may be tracked.
files="$(git ls-files | grep -Ei '\.(pdf|heic|heif|jpe?g|xlsx?|csv)$' | grep -v '^tests/fixtures/' || true)"
if [ -n "$files" ]; then
  printf 'Tracked files that look like client material (synthetic fixtures belong in tests/fixtures/):\n%s\n' "$files"
  status=1
fi

# Environment files: only the empty examples may be tracked.
envs="$(git ls-files | grep -E '(^|/)\.env' | grep -v '\.example$' || true)"
if [ -n "$envs" ]; then
  printf 'Tracked environment files (keep them local, e.g. web/.env.local):\n%s\n' "$envs"
  status=1
fi

# Secrets: private keys, service-account files, Google API keys, GitHub tokens.
if git grep -nIE \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  -e '"type": *"service_account"' \
  -e 'AIza[0-9A-Za-z_-]{35}' \
  -e 'gh[opsur]_[0-9A-Za-z]{36}' \
  -- . ':(exclude)scripts/check-repo.sh'; then
  echo 'A tracked file holds a secret-looking value (above). Move it to a local .env file or a GitHub secret.'
  status=1
fi

[ "$status" -eq 0 ] && echo 'No client material or secrets are tracked.'
exit "$status"
