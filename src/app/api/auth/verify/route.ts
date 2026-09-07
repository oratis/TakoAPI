import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeVerificationToken } from "@/lib/password-reset";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { SITE_URL } from "@/lib/seo";

// Confirm an email address from the link in the verification mail.
//
// Registration mails this link, so the route has to exist: without it every new
// signup received a "Confirm email" button that 404s. Verification is not a gate on
// anything yet — nothing checks `User.emailVerified` — so this records the fact and
// returns the visitor to the site rather than blocking or unblocking access.
//
// GET, because it is reached by clicking a link in an inbox. That makes it
// prefetchable by mail clients and link scanners, which is why the token is
// single-use and short-lived (see lib/password-reset): the worst a scanner can do is
// verify the address the mail was already sent to.
export const dynamic = "force-dynamic";

function back(status: "verified" | "invalid" | "error") {
  return NextResponse.redirect(`${SITE_URL}/dashboard?verify=${status}`);
}

export async function GET(req: NextRequest) {
  // Bounded so the endpoint cannot be used to grind tokens. Per-IP is acceptable
  // here (unlike the login limiter): a rotating caller still has to guess a 256-bit
  // random token, so this is a cost ceiling, not the security boundary.
  const rl = await checkRateLimit(req, { key: "verify", windowMs: 60_000, max: 30 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return back("invalid");

  try {
    const consumed = await consumeVerificationToken(token);
    if (!consumed) return back("invalid");
    await prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerified: new Date() },
    });
    return back("verified");
  } catch (err) {
    console.error("[auth] email verification failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return back("error");
  }
}
