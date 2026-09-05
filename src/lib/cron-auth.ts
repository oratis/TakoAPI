import type { NextRequest } from "next/server";

/**
 * True if the request carries the CRON_SECRET — as `Authorization: Bearer <secret>`
 * or `?key=<secret>`. Refuses (false) when CRON_SECRET is unset, so cron endpoints
 * stay closed rather than open if misconfigured.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  return auth === `Bearer ${secret}` || key === secret;
}
