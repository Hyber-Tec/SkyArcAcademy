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
# Functions whose newest revision didn't start, by name: a deploy of every function at once can run out of the
# region's Cloud Run CPU quota ("Quota exceeded for total allowable CPU"), and such a function keeps serving the
# revision before. The CLI records it as deployed all the same and skips it as unchanged from then on, unless a deploy
# names it.
left_behind() {
  gcloud run services list --project skyarcacademy --region us-central1 --filter="metadata.labels.goog-managed-by=cloudfunctions" --format=json |
    jq -r '[.[] | select(.status.latestCreatedRevisionName != .status.latestReadyRevisionName) | .metadata.annotations["cloudfunctions.googleapis.com/function-id"] // empty] | join(",")'
}

# The deploy that creates a callable function reports "set invoker" for it: the organization doesn't allow the
# public binding the CLI adds (scripts/open-callables.sh). Opening the callables and deploying again settles it.
if ! deploy "$only"; then
  echo "::warning::The functions deploy reported errors. Opening the callable functions and deploying once more."
  bash scripts/open-callables.sh
  deploy "$only" || echo "::warning::The functions deploy reported errors again."
fi
# Then the functions left behind, by this deploy or an earlier one, once the old revisions have let go of their CPU.
behind=$(left_behind)
if [ -n "$behind" ]; then
  echo "::warning::Deploying again the functions whose newest revision didn't start: $behind"
  sleep 60
  deploy "functions:${behind//,/,functions:}" || true
  behind=$(left_behind)
fi
bash scripts/open-callables.sh
if [ -n "$behind" ]; then
  echo "::error::Still serving their previous revision: $behind"
  exit 1
fi
