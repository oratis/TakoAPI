"""Reconcile the production catalog and maintenance schedules using the Cloud SDK identity."""
import json
import subprocess
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PROJECT = "takoapi-491505"
LOCATION = "us-central1"
PARENT = f"projects/{PROJECT}/locations/{LOCATION}"
API = "https://cloudscheduler.googleapis.com/v1"
SITE = "https://takoapi.com/api/cron"
RUN = f"https://{LOCATION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/{PROJECT}/jobs"
HTTP_JOBS = [
    ("takoapi-scrape-agents", "0 6 * * *", "scrape-agents", "GET"),
    ("takoapi-import-hosted", "0 7 * * *", "import-hosted", "GET"),
    ("takoapi-health", "0 * * * *", "health", "GET"),
    ("takoapi-github-check", "0 2 * * 0", "check-github", "POST"),
    ("takoapi-weekly-digest", "0 9 * * 1", "weekly-digest", "POST"),
    ("takoapi-retention", "30 2 * * *", "retention", "POST"),
    ("takoapi-ingestion-health", "15 */6 * * *", "ingestion-health", "GET"),
]
RUN_JOBS = [("takoapi-daily-sync", "0 3 * * *"), ("takoapi-github-skills", "0 5 * * *")]


def cloud(*args):
    return subprocess.check_output(["gcloud", *args, "--project", PROJECT, "--quiet"], text=True).strip()


def request(method, path, token, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = Request(API + "/" + path, data=data, method=method, headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json",
    })
    with urlopen(req, timeout=30) as response:
        return json.load(response)


def reconcile(name, schedule, target, token):
    parent = PARENT + "/jobs"
    path = parent + "/" + name
    body = dict(name=path, schedule=schedule, timeZone="Etc/UTC", httpTarget=target,
                attemptDeadline="360s", retryConfig={"retryCount": 1})
    try:
        request("GET", path, token)
    except HTTPError as exc:
        if exc.code != 404:
            raise
        request("POST", parent, token, body)
    else:
        request("PATCH", path + "?updateMask=schedule,timeZone,httpTarget,attemptDeadline,retryConfig", token, body)
    print(f"{name}  {schedule} UTC", flush=True)


if __name__ == "__main__":
    access = cloud("auth", "print-access-token")
    cron = cloud("secrets", "versions", "access", "latest", "--secret=tako-cron-secret")
    number = cloud("projects", "describe", PROJECT, "--format=value(projectNumber)")
    for job, cadence, endpoint, method in HTTP_JOBS:
        reconcile(job, cadence, {"uri": f"{SITE}/{endpoint}", "httpMethod": method,
                                  "headers": {"Authorization": "Bearer " + cron}}, access)
    for job, cadence in RUN_JOBS:
        reconcile(job + "-schedule", cadence, {"uri": f"{RUN}/{job}:run", "httpMethod": "POST",
                  "oauthToken": {"serviceAccountEmail": number + "-compute@developer.gserviceaccount.com",
                                 "scope": "https://www.googleapis.com/auth/cloud-platform"}}, access)
