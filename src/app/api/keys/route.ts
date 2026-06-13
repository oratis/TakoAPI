import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/lib/api";
import { generateApiKey } from "@/lib/apikey";

// List the current user's active API keys (never returns the secret).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

// Create a new API key. The full secret is returned ONCE.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.slice(0, 100) : null;

  const { key, prefix, hashedKey } = generateApiKey();
  const created = await prisma.apiKey.create({
    data: { userId: session.user.id, name, prefix, hashedKey },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  return NextResponse.json({ ...created, key }, { status: 201 });
}
