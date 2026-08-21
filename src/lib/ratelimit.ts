import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Shared fixed-window rate limiter backed by Postgres (RateLimitBucket). A single
// window now holds across every Cloud Run instance — the previous in-memory Map gave
// each replica its own counter, so the effective limit was max × instance-count and
// the gateway limit (gw:<keyId>) scaled out with the fleet. The window is advanced and
// the counter incremented atomically in one INSERT … ON CONFLICT statement, so replicas
// serialize on the bucket's row lock instead of racing.

export type RateLimitConfig = {
  key: string; // namespace, e.g. "submit" or "gw:<keyId>"
  windowMs: number; // window length
  max: number; // max requests per window
  /**
   * Whether to give each client IP its own bucket under `key`. Default true, which
   * is right for anonymous endpoints where the IP is the only identifier we have.
   *
   * Set false when `key` already names an authenticated principal (e.g. `gw:<keyId>`).
   * The IP is caller-controlled — see `extractClientIp` — so appending it there lets
   * one API key mint unlimited buckets and makes the limit unenforceable.
   */
  perIp?: boolean;
};

/**
 * Best-effort client IP, for coarse anonymous bucketing only.
 *
 * NOT TRUSTWORTHY. Cloud Run / the GCLB *append* the real client address to any
 * inbound X-Forwarded-For, so the first element — the one taken here — is whatever
 * the caller chose to send. Never use this value as an identity, an authorisation
 * input, or evidence; never combine it with a key that already identifies someone.
 */
export function extractClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "anon";
}

// Best-effort sweep of long-expired buckets, throttled per instance to once a minute.
// Live buckets are reset in place on each hit, so this only reclaims keys that fell
// idle (e.g. rotated client IPs). Fire-and-forget; never blocks or fails a request.
const CLEAN_INTERVAL_MS = 60_000;
let lastCleanAt = 0;
function maybeClean() {
  const now = Date.now();
  if (now - lastCleanAt < CLEAN_INTERVAL_MS) return;
  lastCleanAt = now;
  prisma
    .$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" <= now() - interval '1 hour'`
    .catch(() => {});
}

export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const key =
    config.perIp === false ? config.key : `${config.key}:${extractClientIp(req)}`;
  maybeClean();
  try {
    // Atomic upsert: start a fresh window when the bucket is missing or expired,
    // otherwise increment. RETURNING reflects the post-update row, with the remaining
    // window computed against the DB clock so replicas agree without clock-skew.
    const rows = await prisma.$queryRaw<Array<{ count: number; retryAfterMs: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${config.windowMs}::int * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now()
                       THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now()
                         THEN now() + ${config.windowMs}::int * interval '1 millisecond'
                         ELSE "RateLimitBucket"."resetAt" END
      RETURNING
        "count" AS "count",
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now())) * 1000))::int AS "retryAfterMs"
    `;
    const row = rows[0];
    if (row && row.count > config.max) {
      return { ok: false, retryAfterMs: row.retryAfterMs };
    }
    return { ok: true };
  } catch {
    // Never hard-fail a request because the limiter store is briefly unavailable.
    return { ok: true };
  }
}

export function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    }
  );
}
