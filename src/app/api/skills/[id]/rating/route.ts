import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound, parseJson } from "@/lib/api";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";

// Per-user skill rating (1–5) + optional review. Skill.avgRating/ratingCount are
// recomputed from the Rating rows on each write. The Rating table predates
// Prisma-managed ids, so id + updatedAt are set explicitly on write.

function findSkill(idOrSlug: string) {
  return prisma.skill.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: "APPROVED" },
    select: { id: true },
  });
}

async function recompute(tx: Prisma.TransactionClient, skillId: string) {
  const agg = await tx.rating.aggregate({
    where: { skillId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const avgRating = agg._avg.rating ?? 0;
  const ratingCount = agg._count._all;
  await tx.skill.update({ where: { id: skillId }, data: { avgRating, ratingCount } });
  return { avgRating, ratingCount };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await findSkill(id);
  if (!skill) return notFound("Skill not found");
  const session = await auth();
  const [agg, mine] = await Promise.all([
    prisma.rating.aggregate({ where: { skillId: skill.id }, _avg: { rating: true }, _count: { _all: true } }),
    session?.user?.id
      ? prisma.rating.findUnique({
          where: { userId_skillId: { userId: session.user.id, skillId: skill.id } },
          select: { rating: true, review: true },
        })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({
    avgRating: agg._avg.rating ?? 0,
    ratingCount: agg._count._all,
    myRating: mine?.rating ?? null,
    myReview: mine?.review ?? null,
  });
}

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRequestLog(req, "/api/skills/[id]/rating", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "skill-rating", windowMs: 60_000, max: 30 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const { id } = await params;
    const skill = await findSkill(id);
    if (!skill) return notFound("Skill not found");

    const parsed = await parseJson(req, ratingSchema);
    if (!parsed.ok) return parsed.response;
    const { rating, review } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      await tx.rating.upsert({
        where: { userId_skillId: { userId, skillId: skill.id } },
        create: { id: crypto.randomUUID(), userId, skillId: skill.id, rating, review: review ?? null, updatedAt: new Date() },
        update: { rating, review: review ?? null, updatedAt: new Date() },
      });
      return recompute(tx, skill.id);
    });
    return NextResponse.json({ ...result, myRating: rating });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRequestLog(req, "/api/skills/[id]/rating", async (logCtx) => {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const { id } = await params;
    const skill = await findSkill(id);
    if (!skill) return notFound("Skill not found");

    const result = await prisma.$transaction(async (tx) => {
      await tx.rating.deleteMany({ where: { userId, skillId: skill.id } });
      return recompute(tx, skill.id);
    });
    return NextResponse.json({ ...result, myRating: null });
  });
}
