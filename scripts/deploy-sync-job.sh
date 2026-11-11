#!/usr/bin/env bash
# Build once, pin both jobs to the immutable build tag, then reconcile Cloud Scheduler.
set -euo pipefail
cd "$(dirname "$0")/.."
project=takoapi-491505
region=us-central1
if [[ -z ${SYNC_BUILD_ID:-} ]]; then
  SYNC_BUILD_ID=$(gcloud builds submit . --project="$project" --config=cloudbuild.sync.yaml --timeout=1200 --format='value(id)')
fi
image="$region-docker.pkg.dev/$project/takoapi-repo/takoapi-sync:$SYNC_BUILD_ID"
common=(--project="$project" --region="$region" --image="$image"
  --set-cloudsql-instances="$project:$region:takoapi-db" --tasks=1 --parallelism=1
  --cpu=1 --memory=1Gi --task-timeout=1800s --max-retries=1 --quiet)
gcloud run jobs deploy takoapi-daily-sync "${common[@]}" \
  --set-env-vars=CHROME_PATH=/usr/bin/chromium \
  --set-secrets=DATABASE_URL=tako-runtime-database-url:latest
gcloud run jobs deploy takoapi-github-skills "${common[@]}" \
  --set-secrets=DATABASE_URL=tako-runtime-database-url:latest,GITHUB_TOKEN=tako-github-token:latest \
  --command=./node_modules/.bin/tsx --args=scripts/scrape-github-skills.ts,all,50
python3 scripts/configure-catalog-schedules.py
