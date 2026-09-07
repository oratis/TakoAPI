import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { badRequest, conflict, parseJson, serverError } from "@/lib/api";
import { registerSchema } from "@/lib/schemas";
import { sendEmailVerification } from "@/lib/password-reset";

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, { key: "register", windowMs: 60 * 60 * 1000, max: 5 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const parsed = await parseJson(req, registerSchema);
  if (!parsed.ok) return parsed.response;
  const { name, email, password, isAgent } = parsed.data;

  if (!password && !isAgent) {
    return badRequest("Password is required unless registering an agent");
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return conflict("Email already registered");

    const hashedPassword = password ? await bcrypt.hash(password, 12) : null;
    const apiKey = isAgent ? `tako_${crypto.randomBytes(32).toString("hex")}` : null;

    const user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        password: hashedPassword,
        apiKey,
        provider: isAgent ? "openclaw" : "email",
      },
    });

    // Email verification is RECORDED, NOT ENFORCED. Nothing gates on
    // `User.emailVerified` — not authorize(), not any route — and this deliberately
    // does not change that: turning it into a login gate would lock out every account
    // that existed before this line. The token is issued so the flow can be finished
    // by the route that redeems it, which is not part of this change.
    //
    // Runs after the response so signup latency doesn't include a Resend round-trip,
    // and is fully contained: a failure here must not turn a created account into an
    // error the visitor sees.
    after(async () => {
      try {
        await sendEmailVerification(user.id, email);
      } catch (err) {
        console.error("[auth] could not issue an email verification token", {
          userId: user.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      ...(apiKey ? { apiKey } : {}),
    });
  } catch (error) {
    console.error("Registration error:", error);
    return serverError();
  }
}
