import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiUser } from "@/lib/api-user";
import { NO_STORE_HEADERS } from "@/lib/http";

// The signed-in user's own agent listings, every status — so a publisher can see
// whether a submission is pending, approved, rejected (with the reviewer's note)
// or disabled. Mirrors /api/user/skills.
export async function GET(req: NextRequest) {
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agents = await prisma.agent.findMany({
    where: { publisherId: user.id },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      kind: true,
      status: true,
      reviewNote: true,
      featured: true,
      healthStatus: true,
      callsCount: true,
      avgRating: true,
      ratingCount: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true, slug: true } },
      _count: { select: { skills: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: agents.length,
    approved: agents.filter((a) => a.status === "APPROVED").length,
    pending: agents.filter((a) => a.status === "PENDING").length,
    rejected: agents.filter((a) => a.status === "REJECTED").length,
    disabled: agents.filter((a) => a.status === "DISABLED").length,
    totalCalls: agents.reduce((n, a) => n + a.callsCount, 0),
  };

  return NextResponse.json({ agents, stats }, { headers: NO_STORE_HEADERS });
}
