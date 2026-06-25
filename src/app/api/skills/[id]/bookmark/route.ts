import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound } from "@/lib/api";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";

// Per-user skill bookmark (toggle). The Bookmark table predates Prisma-managed
// ids, so id is set explicitly on create.
function findSkill(idOrSlug: string) {
  return prisma.skill.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: "APPROVED" },
    select: { id: true },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await findSkill(id);
  if (!skill) return notFound("Skill not found");
  const session = await auth();
  const bookmarked = session?.user?.id
    ? !!(await prisma.bookmark.findUnique({
        where: { userId_skillId: { userId: session.user.id, skillId: skill.id } },
        select: { id: true },
      }))
    : false;
  return NextResponse.json({ bookmarked });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRequestLog(req, "/api/skills/[id]/bookmark", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "skill-bookmark", windowMs: 60_000, max: 60 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const { id } = await params;
    const skill = await findSkill(id);
    if (!skill) return notFound("Skill not found");

    const bookmarked = await prisma.$transaction(async (tx) => {
      const existing = await tx.bookmark.findUnique({
        where: { userId_skillId: { userId, skillId: skill.id } },
        select: { id: true },
      });
      if (existing) {
        await tx.bookmark.delete({ where: { id: existing.id } });
        return false;
      }
      await tx.bookmark.create({ data: { id: crypto.randomUUID(), userId, skillId: skill.id } });
      return true;
    });
    return NextResponse.json({ bookmarked });
  });
}
