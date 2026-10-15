#!/usr/bin/env bash
# Lets anyone reach the callable functions, as Firebase callables need: each one checks the caller's sign-in itself.
# HyberTec's organization doesn't allow `allUsers` in IAM policies, so instead of the usual public invoker binding, each
# callable's Cloud Run service has its invoker IAM check turned off (docs/DEPLOY.md). Safe to run again.
set -euo pipefail
PROJECT=skyarcacademy
REGION=us-central1
for svc in $(gcloud run services list --project "$PROJECT" --region "$REGION" --filter="metadata.labels.deployment-callable=true" --format="value(metadata.name)"); do
  off=$(gcloud run services describe "$svc" --project "$PROJECT" --region "$REGION" --format="value(metadata.annotations.'run.googleapis.com/invoker-iam-disabled')")
  if [ "$off" = "true" ]; then
    echo "open: $svc"
  else
    gcloud run services update "$svc" --project "$PROJECT" --region "$REGION" --no-invoker-iam-check --quiet >/dev/null
    echo "opened: $svc"
  fi
done
