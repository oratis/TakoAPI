#!/bin/bash
# Deploy the daily sync job to Cloud Run Jobs + Cloud Scheduler.
# Usage: ./scripts/deploy-sync-job.sh
#
# SECRETS: the database URL is bound from Secret Manager (tako-database-url),
# never written into this file or into the job's plain env vars. An earlier
# version of this script carried the Cloud SQL password inline — that password
# must be treated as compromised and rotated (see docs/08-tech-review-2026-09-05.md §1.1).

set -euo pipefail

PROJECT=takoapi-491505
REGION=us-central1
JOB_NAME=takoapi-daily-sync
IMAGE=us-central1-docker.pkg.dev/$PROJECT/takoapi-repo/takoapi-sync:latest
DB_SECRET=tako-database-url

echo "=== Building sync Docker image ==="
gcloud builds submit \
  --project=$PROJECT \
  --config=cloudbuild.sync.yaml \
  --timeout=600 \
  .

echo "=== Creating/Updating Cloud Run Job ==="
COMMON_ARGS=(
  --project=$PROJECT
  --region=$REGION
  --image=$IMAGE
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest"
  --set-env-vars="CHROME_PATH=/usr/bin/chromium"
  --set-cloudsql-instances=$PROJECT:$REGION:takoapi-db
  --memory=1Gi
  --cpu=1
  --task-timeout=1800
  --max-retries=1
  --quiet
)
if gcloud run jobs describe $JOB_NAME --project=$PROJECT --region=$REGION >/dev/null 2>&1; then
  gcloud run jobs update $JOB_NAME "${COMMON_ARGS[@]}"
else
  gcloud run jobs create $JOB_NAME "${COMMON_ARGS[@]}"
fi

echo "=== Enabling Cloud Scheduler API ==="
gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT --quiet

echo "=== Creating/Updating Cloud Scheduler (daily at 03:00 UTC) ==="
SA_EMAIL=$(gcloud iam service-accounts list --project=$PROJECT --format="value(email)" --filter="displayName:Default compute service account" | head -1)
SCHED_ARGS=(
  --project=$PROJECT
  --location=$REGION
  --schedule="0 3 * * *"
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/$JOB_NAME:run"
  --http-method=POST
  --oauth-service-account-email="$SA_EMAIL"
  --quiet
)
if gcloud scheduler jobs describe "$JOB_NAME-schedule" --project=$PROJECT --location=$REGION >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB_NAME-schedule" "${SCHED_ARGS[@]}"
else
  gcloud scheduler jobs create http "$JOB_NAME-schedule" "${SCHED_ARGS[@]}"
fi

echo ""
echo "=== Done! ==="
echo "Job: $JOB_NAME"
echo "Schedule: Daily at 03:00 UTC"
echo "Manual run: gcloud run jobs execute $JOB_NAME --region=$REGION --project=$PROJECT"
