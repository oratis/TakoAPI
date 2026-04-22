import { NextRequest, NextResponse } from "next/server";

// In-memory fixed-window counter. Suitable for Cloud Run single-instance deployments.
// For multi-instance, swap for a Redis-backed limiter (e.g. @upstash/ratelimit).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodic cleanup to prevent unbounded growth
const CLEAN_INTERVAL_MS = 60_000;
let lastCleanAt = 0;
function maybeClean(now: number) {
  if (now - lastCleanAt < CLEAN_INTERVAL_MS) return;
  lastCleanAt = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitConfig = {
  key: string;          // namespace, e.g. "submit"
  windowMs: number;     // window length
  max: number;          // max requests per window
};

export function extractClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "anon";
}

export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  maybeClean(now);
  const ip = extractClientIp(req);
  const key = `${config.key}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { ok: true };
  }
  if (bucket.count >= config.max) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count++;
  return { ok: true };
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
