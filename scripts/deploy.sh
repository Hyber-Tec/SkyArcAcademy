#!/usr/bin/env bash
# Deploys main to production. CI runs it after the checks pass, signed in as the deploy service account; see
# docs/DEPLOY.md before running it by hand.
set -euo pipefail
FIREBASE=(npx --yes firebase-tools@15.32.1)
deploy() { "${FIREBASE[@]}" deploy --only "$1" --project skyarcacademy --non-interactive --force; }

deploy hosting,firestore,database,storage

# The deploy that creates a callable function reports "set invoker" for it: the organization doesn't allow the
# public binding the CLI adds (scripts/open-callables.sh). Opening the callables and deploying again settles it.
if ! deploy functions; then
  echo "::warning::The functions deploy reported errors. Opening the callable functions and deploying once more."
  bash scripts/open-callables.sh
  deploy functions
fi
bash scripts/open-callables.sh
