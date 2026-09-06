import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/lib/api";
import { NO_STORE_HEADERS } from "@/lib/http";

// Gateway usage for the signed-in developer. Returns totals, the recent call log,
// and a 14-day daily series so the dashboard can plot activity instead of showing
// only the last 15 rows (from which no trend is readable).

const DAILY_WINDOW_DAYS = 14;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const since = new Date(Date.now() - DAILY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const [totalCalls, recent, byAgent, spend, daily] = await Promise.all([
    prisma.invocation.count({ where: { userId } }),
    prisma.invocation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { agent: { select: { name: true, slug: true } } },
    }),
    prisma.invocation.groupBy({ by: ["agentId"], where: { userId }, _count: { _all: true } }),
    prisma.invocation.aggregate({ where: { userId }, _sum: { billedUsd: true } }),
    // Grouped in Postgres rather than pulled row-by-row: a busy key would otherwise
    // ship every invocation of the fortnight to the app just to bucket it.
    prisma.$queryRaw<Array<{ day: Date; calls: bigint; errors: bigint; billed: string | null }>>`
      SELECT date_trunc('day', "createdAt") AS day,
             count(*)                        AS calls,
             count(*) FILTER (WHERE "status" >= 400) AS errors,
             sum("billedUsd")                AS billed
      FROM "Invocation"
      WHERE "userId" = ${userId} AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  // Fill the gaps so the client can render a fixed-width chart without date maths.
  const byDay = new Map(
    daily.map((d) => [
      d.day.toISOString().slice(0, 10),
      { calls: Number(d.calls), errors: Number(d.errors), billedUsd: d.billed ? Number(d.billed) : 0 },
    ])
  );
  const series = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) => {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, ...(byDay.get(key) ?? { calls: 0, errors: 0, billedUsd: 0 }) };
  });

  return NextResponse.json(
    {
      totalCalls,
      agentsUsed: byAgent.length,
      totalSpendUsd: Number(spend._sum.billedUsd ?? 0),
      series,
      recent: recent.map((i) => ({
        id: i.id,
        agent: i.agent?.name ?? "—",
        slug: i.agent?.slug ?? null,
        protocol: i.protocol,
        status: i.status,
        latencyMs: i.latencyMs,
        billedUsd: i.billedUsd != null ? Number(i.billedUsd) : null,
        errorCode: i.errorCode,
        createdAt: i.createdAt,
      })),
    },
    { headers: NO_STORE_HEADERS }
  );
}
