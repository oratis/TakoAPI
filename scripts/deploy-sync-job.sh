#!/bin/bash
# Deploy the daily sync job to Cloud Run + Cloud Scheduler
# Usage: ./scripts/deploy-sync-job.sh

set -e

PROJECT=takoapi-491505
REGION=us-central1
JOB_NAME=takoapi-daily-sync
IMAGE=us-central1-docker.pkg.dev/$PROJECT/takoapi-repo/takoapi-sync:latest

echo "=== Building sync Docker image ==="
gcloud builds submit \
  --project=$PROJECT \
  --tag=$IMAGE \
  --dockerfile=Dockerfile.sync \
  --timeout=600

echo "=== Creating/Updating Cloud Run Job ==="
gcloud run jobs create $JOB_NAME \
  --project=$PROJECT \
  --region=$REGION \
  --image=$IMAGE \
  --set-env-vars="DATABASE_URL=postgresql://postgres:TakoAPI2026Secure@localhost/takoapi?host=/cloudsql/$PROJECT:$REGION:takoapi-db,CHROME_PATH=/usr/bin/chromium" \
  --set-cloudsql-instances=$PROJECT:$REGION:takoapi-db \
  --memory=1Gi \
  --cpu=1 \
  --task-timeout=1800 \
  --max-retries=1 \
  --quiet 2>/dev/null || \
gcloud run jobs update $JOB_NAME \
  --project=$PROJECT \
  --region=$REGION \
  --image=$IMAGE \
  --set-env-vars="DATABASE_URL=postgresql://postgres:TakoAPI2026Secure@localhost/takoapi?host=/cloudsql/$PROJECT:$REGION:takoapi-db,CHROME_PATH=/usr/bin/chromium" \
  --set-cloudsql-instances=$PROJECT:$REGION:takoapi-db \
  --memory=1Gi \
  --cpu=1 \
  --task-timeout=1800 \
  --max-retries=1 \
  --quiet

echo "=== Enabling Cloud Scheduler API ==="
gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT --quiet

echo "=== Creating Cloud Scheduler (daily at 03:00 UTC) ==="
gcloud scheduler jobs create http $JOB_NAME-schedule \
  --project=$PROJECT \
  --location=$REGION \
  --schedule="0 3 * * *" \
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/$JOB_NAME:run" \
  --http-method=POST \
  --oauth-service-account-email=$(gcloud iam service-accounts list --project=$PROJECT --format="value(email)" --filter="displayName:Default compute service account" | head -1) \
  --quiet 2>/dev/null || \
gcloud scheduler jobs update http $JOB_NAME-schedule \
  --project=$PROJECT \
  --location=$REGION \
  --schedule="0 3 * * *" \
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/$JOB_NAME:run" \
  --http-method=POST \
  --quiet

echo ""
echo "=== Done! ==="
echo "Job: $JOB_NAME"
echo "Schedule: Daily at 03:00 UTC"
echo "Manual run: gcloud run jobs execute $JOB_NAME --region=$REGION --project=$PROJECT"
