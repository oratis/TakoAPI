import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveApiUser } from "@/lib/api-user";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";
import { NO_STORE_HEADERS } from "@/lib/http";

function findSkill(idOrSlug: string) {
  return prisma.skill.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: "APPROVED" },
    select: { id: true, likesCount: true },
  });
}

// Whether the current viewer has already liked this skill. The detail page used to
// assume "not liked" on every load, so an already-liked visitor clicking the heart
// silently removed their like and displayed a count one lower than the truth.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await findSkill(id);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const session = await auth();
  const liked = session?.user?.id
    ? !!(await prisma.like.findUnique({
        where: { userId_skillId: { userId: session.user.id, skillId: skill.id } },
        select: { id: true },
      }))
    : false;

  return NextResponse.json({ liked, likesCount: skill.likesCount }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRequestLog(req, "/api/skills/[id]/like", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "like", windowMs: 60_000, max: 60 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const user = await resolveApiUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logCtx.userId = user.id;

    const { id } = await params;
    const skill = await findSkill(id);
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    // The toggle and the denormalized counter move together, so the count can never
    // drift from the rows behind it.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: { userId_skillId: { userId: user.id, skillId: skill.id } },
        select: { id: true },
      });
      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        const updated = await tx.skill.update({
          where: { id: skill.id },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        });
        return { liked: false, likesCount: updated.likesCount };
      }
      await tx.like.create({ data: { userId: user.id, skillId: skill.id } });
      const updated = await tx.skill.update({
        where: { id: skill.id },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      });
      return { liked: true, likesCount: updated.likesCount };
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  });
}
