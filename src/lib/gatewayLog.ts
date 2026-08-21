// Structured telemetry for gateway calls we reject before they reach an agent.
//
// Why this exists: 401 / 402 / 429 are all returned *before* meterInvocation runs,
// and none of the /v1 or /mcp routes go through withRequestLog, so a rejected call
// produced no Invocation row and no RequestLog row. Any error rate computed from
// the Invocation table is therefore missing exactly the calls the gateway turned
// away — the denominator excludes our own refusals.
//
// Cloud Run's platform request log does record these responses (timestamp, status,
// URL, 30-day retention), so they are not invisible — they are unattributable. It
// carries no userId, no apiKeyId, no agent, and no reason, and 402 and 429 look
// identical apart from the status code. This closes that gap without adding a DB
// write per rejection: one structured line to stdout, which Cloud Run parses into
// jsonPayload, so the fields are queryable in Logs Explorer and joinable on userId.

export type RejectionReason =
  | "unauthenticated" // no/invalid API key — nothing to attribute the call to
  | "rate_limited" // over the per-key (or per-IP, on /mcp) allowance
  | "insufficient_credit"; // authenticated, but the balance would go under the floor

export type GatewayRejection = {
  route: string; // route template, never an interpolated path (keeps cardinality low)
  reason: RejectionReason;
  status: number;
  apiKeyId?: string | null;
  userId?: string | null;
  agentSlug?: string | null;
  /** 402 only — the two numbers that quantify demand lost to an empty balance. */
  requiredUsd?: number;
  balanceUsd?: number;
};

/**
 * Emit one rejection event. Never throws and never awaits anything: a telemetry
 * problem must not change what the caller is told.
 */
export function logGatewayRejection(event: GatewayRejection): void {
  try {
    console.log(
      JSON.stringify({
        severity: "WARNING",
        message: `gateway_call_rejected ${event.reason} ${event.route}`,
        event: "gateway_call_rejected",
        ...event,
      })
    );
  } catch {
    // A telemetry line is never worth failing a request over.
  }
}
