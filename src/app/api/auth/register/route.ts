import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, isAgent } = await req.json();

    if (!email || (!password && !isAgent)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

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
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
