import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/** Length-safe constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, and the length of a secret is not
  // itself the secret, so compare lengths first and bail out.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * True if the request carries the CRON_SECRET as `Authorization: Bearer <secret>`.
 * Refuses (false) when CRON_SECRET is unset, so cron endpoints stay closed rather
 * than open if misconfigured.
 *
 * The secret is accepted in the header only. `?key=<secret>` used to work too, and
 * Cloud Run's request log records the full URL including the query string with a
 * 30-day retention — so one debugging `curl ".../api/cron/health?key=$CRON_SECRET"`
 * would have copied the secret into a log that anyone with `logging.viewer` can
 * read, far wider than the Secret Manager binding it came from. The secret guards
 * five cron routes, one of which sends email, so the blast radius is more than an
 * extra scraper run.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  return safeEqual(auth, `Bearer ${secret}`);
}
