import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, parseJson, serverError } from "@/lib/api";
import { NO_STORE_HEADERS } from "@/lib/http";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { consumeResetToken } from "@/lib/password-reset";

// Redeem a password-reset link. Declared here rather than in src/lib/schemas.ts
// because it is used by this route alone; move it there if a second caller appears.
// The 8-character minimum matches registerSchema — a reset must not be a way to set
// a weaker password than signup accepts.
const resetSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  // Generous, since a 256-bit token is not something anyone guesses: this only keeps
  // a broken client (or a script) from hammering the endpoint.
  const rl = await checkRateLimit(req, { key: "reset", windowMs: 60 * 60 * 1000, max: 20 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const parsed = await parseJson(req, resetSchema);
  if (!parsed.ok) return parsed.response;
  const { token, password } = parsed.data;

  try {
    // Claimed first and once: if anything below fails the link is already spent and
    // the visitor has to request another. That is the safe direction to fail in —
    // the alternative leaves a redeemed link working.
    const claimed = await consumeResetToken(token);
    if (!claimed) return badRequest("This password reset link is invalid or has expired");

    // Cost 12, the same as /api/auth/register — a reset must not silently downgrade
    // the hash the account is stored under.
    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: claimed.userId },
      data: { password: hashedPassword },
    });

    // Sessions are JWTs in a cookie (session.strategy = "jwt"), so a session stolen
    // before the reset survives it until the token expires — there is nothing
    // server-side to revoke. The Session table is only written by the adapter's
    // database flows, so this clears whatever rows the account does have rather than
    // leaving them valid behind a changed password.
    await prisma.session.deleteMany({ where: { userId: claimed.userId } });

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error("[auth] password reset failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return serverError();
  }
}
