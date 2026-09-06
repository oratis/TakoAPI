import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { NO_STORE_HEADERS } from "@/lib/http";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/stats", async () => {
    // The gateway window is the same 30 days the billing pages quote, so the two
    // numbers can be reconciled against each other.
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const [
      totalSkills,
      totalUsers,
      totalCategories,
      totalLikes,
      pendingSkills,
      totalViews,
      totalDownloads,
      recentSkills,
      topSkills,
      totalAgents,
      pendingAgents,
      hostedAgents,
      projectAgents,
      gatewayCalls30d,
      gatewayBilled30d,
    ] = await Promise.all([
      prisma.skill.count(),
      prisma.user.count(),
      prisma.category.count(),
      prisma.like.count(),
      prisma.skill.count({ where: { status: "PENDING" } }),
      prisma.skill.aggregate({ _sum: { viewsCount: true } }),
      prisma.skill.aggregate({ _sum: { downloads: true } }),
      prisma.skill.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, slug: true, author: true, createdAt: true, status: true },
      }),
      prisma.skill.findMany({
        orderBy: { downloads: "desc" },
        take: 5,
        select: { id: true, name: true, slug: true, downloads: true, likesCount: true, viewsCount: true },
      }),
      prisma.agent.count(),
      prisma.agent.count({ where: { status: "PENDING" } }),
      prisma.agent.count({ where: { kind: "HOSTED" } }),
      prisma.agent.count({ where: { kind: "PROJECT" } }),
      prisma.invocation.count({ where: { createdAt: { gte: since } } }),
      prisma.invocation.aggregate({
        _sum: { billedUsd: true },
        where: { createdAt: { gte: since } },
      }),
    ]);

    return NextResponse.json(
      {
        // Existing shape — the admin dashboard reads these keys by name.
        totalSkills,
        totalUsers,
        totalCategories,
        totalLikes,
        pendingSkills,
        totalViews: totalViews._sum.viewsCount || 0,
        totalDownloads: totalDownloads._sum.downloads || 0,
        recentSkills,
        topSkills,
        // Agents were missing entirely: the dashboard reported a skills-only site
        // long after the registry became the product.
        pendingAgents,
        agents: {
          total: totalAgents,
          pending: pendingAgents,
          hosted: hostedAgents,
          project: projectAgents,
        },
        gateway: {
          calls30d: gatewayCalls30d,
          // Decimal → number: JSON has no decimal type, and these are dashboard
          // figures, not ledger entries.
          billedUsd30d: Number(gatewayBilled30d._sum.billedUsd ?? 0),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  });
}
