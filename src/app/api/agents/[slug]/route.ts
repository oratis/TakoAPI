import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api";
import { withRequestLog } from "@/lib/requestLog";
import { PUBLIC_CACHE_HEADERS } from "@/lib/http";
import { PUBLIC_AGENT_SELECT, toPublicAgent } from "@/lib/agent-dto";

// Public agent detail. Uses the shared whitelist: internal moderation fields
// (reviewNote, publisherId, categoryId) and the publisher's avatar URL are never
// part of the public shape — this response is consumed by the MCP `get_agent`
// tool and third-party clients, not just our own pages.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return withRequestLog(req, "/api/agents/[slug]", async () => {
    const { slug } = await params;
    const agent = await prisma.agent.findFirst({
      where: { slug, status: "APPROVED" },
      select: {
        ...PUBLIC_AGENT_SELECT,
        skills: {
          orderBy: { name: "asc" },
          select: {
            skillKey: true,
            name: true,
            description: true,
            inputModes: true,
            outputModes: true,
            examples: true,
          },
        },
      },
    });
    if (!agent) return notFound("Agent not found");
    return NextResponse.json(toPublicAgent(agent), { headers: PUBLIC_CACHE_HEADERS });
  });
}
