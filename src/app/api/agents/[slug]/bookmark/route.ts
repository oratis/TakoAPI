import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound } from "@/lib/api";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";

function findAgent(slug: string) {
  return prisma.agent.findFirst({
    where: { OR: [{ slug }, { id: slug }], status: "APPROVED" },
    select: { id: true },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await findAgent(slug);
  if (!agent) return notFound("Agent not found");
  const session = await auth();
  const bookmarked = session?.user?.id
    ? !!(await prisma.agentBookmark.findUnique({
        where: { userId_agentId: { userId: session.user.id, agentId: agent.id } },
        select: { id: true },
      }))
    : false;
  return NextResponse.json({ bookmarked });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withRequestLog(req, "/api/agents/[slug]/bookmark", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "agent-bookmark", windowMs: 60_000, max: 60 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const { slug } = await params;
    const agent = await findAgent(slug);
    if (!agent) return notFound("Agent not found");

    const bookmarked = await prisma.$transaction(async (tx) => {
      const existing = await tx.agentBookmark.findUnique({
        where: { userId_agentId: { userId, agentId: agent.id } },
        select: { id: true },
      });
      if (existing) {
        await tx.agentBookmark.delete({ where: { id: existing.id } });
        return false;
      }
      await tx.agentBookmark.create({ data: { userId, agentId: agent.id } });
      return true;
    });
    return NextResponse.json({ bookmarked });
  });
}
