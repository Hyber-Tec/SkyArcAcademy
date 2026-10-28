#!/usr/bin/env bash
# Lets anyone reach the callable functions, as Firebase callables need: each one checks the caller's sign-in itself.
# HyberTec's organization doesn't allow `allUsers` in IAM policies, so instead of the usual public invoker binding, each
# callable's Cloud Run service has its invoker IAM check turned off (docs/DEPLOY.md). Safe to run again. One listing
# says which are open already; the others are opened side by side.
set -euo pipefail
PROJECT=skyarcacademy
REGION=us-central1
services=$(gcloud run services list --project "$PROJECT" --region "$REGION" --filter="metadata.labels.deployment-callable=true" \
  --format="value(metadata.name,metadata.annotations.'run.googleapis.com/invoker-iam-disabled')")
pids=()
while IFS=$'\t' read -r svc off; do
  [ -n "$svc" ] || continue
  if [ "$off" = "true" ]; then
    echo "open: $svc"
  else
    (gcloud run services update "$svc" --project "$PROJECT" --region "$REGION" --no-invoker-iam-check --quiet >/dev/null && echo "opened: $svc") &
    pids+=("$!")
  fi
done <<<"$services"
failed=0
for pid in "${pids[@]+"${pids[@]}"}"; do wait "$pid" || failed=1; done
exit "$failed"
