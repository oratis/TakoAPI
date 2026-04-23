import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";

async function getUser(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    return prisma.user.findUnique({ where: { apiKey } });
  }
  const session = await auth();
  if (session?.user?.id) {
    return prisma.user.findUnique({ where: { id: session.user.id } });
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRequestLog(req, "/api/skills/[id]/like", async (logCtx) => {
    const rl = checkRateLimit(req, { key: "like", windowMs: 60_000, max: 60 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logCtx.userId = user.id;

    const { id } = await params;
    const skill = await prisma.skill.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, status: true },
    });
    if (!skill || skill.status !== "APPROVED") {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingLike = await tx.like.findUnique({
        where: { userId_skillId: { userId: user.id, skillId: skill.id } },
      });
      if (existingLike) {
        await tx.like.delete({ where: { id: existingLike.id } });
        await tx.skill.update({
          where: { id: skill.id },
          data: { likesCount: { decrement: 1 } },
        });
        return { liked: false };
      } else {
        await tx.like.create({ data: { userId: user.id, skillId: skill.id } });
        await tx.skill.update({
          where: { id: skill.id },
          data: { likesCount: { increment: 1 } },
        });
        return { liked: true };
      }
    });

    return NextResponse.json(result);
  });
}
