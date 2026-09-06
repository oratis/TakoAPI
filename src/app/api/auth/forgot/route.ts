import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { NO_STORE_HEADERS } from "@/lib/http";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { createResetToken } from "@/lib/password-reset";

// Request a password-reset link. Declared here rather than in src/lib/schemas.ts
// because it is used by this route alone; move it there if a second caller appears.
const forgotSchema = z.object({
  email: z.string().email().max(200),
});

/** The one response this endpoint ever gives on a well-formed request. */
const ACCEPTED = { ok: true } as const;

export async function POST(req: NextRequest) {
  // 5/hour/IP. This endpoint sends mail to an address the caller picked, so without a
  // budget it is a free mail bomber pointed at anyone's inbox.
  const rl = await checkRateLimit(req, { key: "forgot", windowMs: 60 * 60 * 1000, max: 5 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const parsed = await parseJson(req, forgotSchema);
  if (!parsed.ok) return parsed.response;
  const { email } = parsed.data;

  // Deferred until after the response for two reasons: the caller isn't kept waiting
  // on a Resend round-trip, and the reply time no longer depends on whether the
  // address is registered — sending mail is by far the slowest branch, so doing it
  // inline would turn latency into an account-existence oracle that the identical
  // response body is there to prevent.
  after(async () => {
    try {
      await createResetToken(email);
    } catch (err) {
      console.error("[auth] password reset request failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return NextResponse.json(ACCEPTED, { headers: NO_STORE_HEADERS });
}
