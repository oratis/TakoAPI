import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api";
import { withRequestLog } from "@/lib/requestLog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return withRequestLog(req, "/api/agents/[slug]", async () => {
    const { slug } = await params;
    const agent = await prisma.agent.findFirst({
      where: { slug, status: "APPROVED" },
      include: {
        category: { select: { name: true, slug: true } },
        skills: { orderBy: { name: "asc" } },
        publisher: { select: { name: true, username: true, image: true } },
      },
    });
    if (!agent) return notFound("Agent not found");
    return NextResponse.json(agent);
  });
}
