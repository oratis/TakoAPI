// Structured telemetry for content-ingestion runs.
//
// Why this exists: `takoapi-daily-sync` fired at 03:00 UTC every day between
// 2026-07-04 and 2026-09-05, exited 0 every time, and imported nothing. The
// ClawSkills scrape picks category chips out of the DOM by matching a regex over
// button text; when that site's markup changed the filter matched zero buttons,
// the import loop never ran, and "nothing was thrown" was reported as success.
// Two months of a frozen catalogue behind a green tick, with no signal anywhere.
//
// The fix is to make "how far did this run actually move the catalogue" a
// first-class machine-readable output of every ingestion job instead of a line of
// prose on stdout. Cloud Run parses a single-line JSON write into `jsonPayload`,
// so these fields are queryable in Logs Explorer and alertable:
//
//   jsonPayload.event="ingestion_run" AND severity="ERROR"
//
// `found: 0` is the broken-scrape signature — the source answered, nothing threw,
// and the selectors matched nothing. That is a different failure from
// `imported: 0`, which for the idempotent importers can simply mean the catalogue
// was already current. Only the caller knows which of its own counts is the
// alarming one, so the caller decides and passes the reason in `errors`.

export type IngestionRun = {
  /** Stable job name — the field an alert filters on. Never interpolate a run id. */
  job: string;
  /** Candidates the source yielded, before any filtering. Zero means a dead scrape. */
  found: number;
  /** Rows actually written (inserted or refreshed). */
  imported: number;
  /** Candidates deliberately not written: filtered out, invalid, or already current. */
  skipped: number;
  durationMs: number;
  /** Empty on a healthy run. Anything here flips the line to severity ERROR. */
  errors?: string[];
};

export type IngestionSeverity = "INFO" | "ERROR";

/**
 * Emit one run-summary line and return the severity it was logged at.
 *
 * Returning the severity is deliberate: callers key their exit code / HTTP status
 * off it, so the red tick in Cloud Scheduler and the ERROR line in Cloud Logging
 * can never disagree about whether a run was good — which is exactly how the
 * two-month outage stayed invisible. Never throws: a telemetry problem must not
 * change the outcome of the run it describes.
 */
export function logIngestionRun(run: IngestionRun): IngestionSeverity {
  const errors = run.errors ?? [];
  const severity: IngestionSeverity = errors.length > 0 ? "ERROR" : "INFO";
  try {
    console.log(
      JSON.stringify({
        severity,
        // Human-readable prefix so the Logs Explorer summary row is legible
        // without expanding jsonPayload.
        message:
          `ingestion_run ${run.job} found=${run.found} imported=${run.imported} skipped=${run.skipped}` +
          (errors.length ? ` errors=${errors.length}` : ""),
        event: "ingestion_run",
        ...run,
        errors,
      })
    );
  } catch {
    // A telemetry line is never worth failing a run over.
  }
  return severity;
}
