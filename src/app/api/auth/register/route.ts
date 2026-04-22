import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { badRequest, conflict, parseJson, serverError } from "@/lib/api";
import { registerSchema } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { key: "register", windowMs: 60 * 60 * 1000, max: 5 });
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
