import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound, parseJson } from "@/lib/api";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";

// Per-user agent rating (1–5) with optional review. avgRating + ratingCount on
// the Agent are denormalized for fast listing/sort, so every write recomputes
// them from the AgentRating rows inside the same transaction.

function findAgent(slug: string) {
  return prisma.agent.findFirst({
    where: { OR: [{ slug }, { id: slug }], status: "APPROVED" },
    select: { id: true },
  });
}

async function recompute(tx: Prisma.TransactionClient, agentId: string) {
  const agg = await tx.agentRating.aggregate({
    where: { agentId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const avgRating = agg._avg.rating ?? 0;
  const ratingCount = agg._count._all;
  await tx.agent.update({ where: { id: agentId }, data: { avgRating, ratingCount } });
  return { avgRating, ratingCount };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await findAgent(slug);
  if (!agent) return notFound("Agent not found");
  const session = await auth();
  const [agg, mine] = await Promise.all([
    prisma.agentRating.aggregate({ where: { agentId: agent.id }, _avg: { rating: true }, _count: { _all: true } }),
    session?.user?.id
      ? prisma.agentRating.findUnique({
          where: { userId_agentId: { userId: session.user.id, agentId: agent.id } },
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withRequestLog(req, "/api/agents/[slug]/rating", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "agent-rating", windowMs: 60_000, max: 30 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const { slug } = await params;
    const agent = await findAgent(slug);
    if (!agent) return notFound("Agent not found");

    const parsed = await parseJson(req, ratingSchema);
    if (!parsed.ok) return parsed.response;
    const { rating, review } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      await tx.agentRating.upsert({
        where: { userId_agentId: { userId, agentId: agent.id } },
        create: { userId, agentId: agent.id, rating, review: review ?? null },
        update: { rating, review: review ?? null },
      });
      return recompute(tx, agent.id);
    });
    return NextResponse.json({ ...result, myRating: rating });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withRequestLog(req, "/api/agents/[slug]/rating", async (logCtx) => {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const { slug } = await params;
    const agent = await findAgent(slug);
    if (!agent) return notFound("Agent not found");

    const result = await prisma.$transaction(async (tx) => {
      await tx.agentRating.deleteMany({ where: { userId, agentId: agent.id } });
      return recompute(tx, agent.id);
    });
    return NextResponse.json({ ...result, myRating: null });
  });
}
