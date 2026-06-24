import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/lib/api";

// Usage summary for the current user's gateway invocations.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const [totalCalls, recent, byAgent, spend] = await Promise.all([
    prisma.invocation.count({ where: { userId } }),
    prisma.invocation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { agent: { select: { name: true, slug: true } } },
    }),
    prisma.invocation.groupBy({ by: ["agentId"], where: { userId }, _count: { _all: true } }),
    prisma.invocation.aggregate({ where: { userId }, _sum: { billedUsd: true } }),
  ]);

  return NextResponse.json({
    totalCalls,
    agentsUsed: byAgent.length,
    totalSpendUsd: Number(spend._sum.billedUsd ?? 0),
    recent: recent.map((i) => ({
      id: i.id,
      agent: i.agent?.name ?? "—",
      slug: i.agent?.slug ?? null,
      protocol: i.protocol,
      status: i.status,
      latencyMs: i.latencyMs,
      billedUsd: i.billedUsd != null ? Number(i.billedUsd) : null,
      createdAt: i.createdAt,
    })),
  });
}
