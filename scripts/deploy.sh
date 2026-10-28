#!/usr/bin/env bash
# Deploys main to production. CI runs it after the checks pass, signed in as the deploy service account, with what
# scripts/deploy-plan.ts found changed since the last deploy; by hand (docs/DEPLOY.md, only when GitHub Actions is
# down) it deploys everything.
#   DEPLOY_TARGETS    what of hosting,firestore,storage,database to deploy (unset: all four; empty: none of them)
#   DEPLOY_FUNCTIONS  "all" (unset), "none", or the functions to deploy, by name: "cancelClass,requestClass"
set -euo pipefail
FIREBASE=(npx --yes firebase-tools@15.32.1)
deploy() { "${FIREBASE[@]}" deploy --only "$1" --project skyarcacademy --non-interactive --force; }

targets=${DEPLOY_TARGETS-hosting,firestore,database,storage}
functions=${DEPLOY_FUNCTIONS-all}
[[ $targets =~ ^((hosting|firestore|storage|database)(,|$))*$ ]] || { echo "Unknown DEPLOY_TARGETS: $targets" >&2; exit 1; }
[[ $functions =~ ^[A-Za-z0-9_]+(,[A-Za-z0-9_]+)*$ ]] || { echo "Unknown DEPLOY_FUNCTIONS: $functions" >&2; exit 1; }

if [ -n "$targets" ]; then deploy "$targets"; fi

case $functions in
  none) exit 0 ;;
  all) only=functions ;;
  *) only=functions:${functions//,/,functions:} ;;
esac
# The deploy that creates a callable function reports "set invoker" for it: the organization doesn't allow the
# public binding the CLI adds (scripts/open-callables.sh). Opening the callables and deploying again settles it.
if ! deploy "$only"; then
  echo "::warning::The functions deploy reported errors. Opening the callable functions and deploying once more."
  bash scripts/open-callables.sh
  deploy "$only"
fi
bash scripts/open-callables.sh
