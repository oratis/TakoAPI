import { NextRequest, NextResponse, after } from "next/server";
import { withAdmin, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { notFound, parseJson } from "@/lib/api";
import { adminAgentUpdateSchema } from "@/lib/schemas";
import { isScenarioSlug } from "@/lib/scenarios";
import { revalidateAgents } from "@/lib/revalidate";
import { sendReviewResultEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/seo";
import { NO_STORE_HEADERS } from "@/lib/http";

/**
 * Tell the publisher what the moderator decided.
 *
 * Deferred with `after` so the mail never sits between the moderator and their
 * response, and never fails the moderation: a submission that was approved in the
 * database stays approved even if Resend is down. Failures are logged with the
 * agent id so a missing notification can be traced.
 *
 * A rejected agent has no public page (the detail route 404s anything that is not
 * APPROVED), so the "resubmit" link goes to the dashboard, where the publisher can
 * see the status and the reviewer's note.
 */
function notifyReviewOutcome(input: {
  agentId: string;
  email: string;
  name: string;
  slug: string;
  approved: boolean;
  note: string | null;
}) {
  after(async () => {
    try {
      await sendReviewResultEmail(input.email, {
        kind: "agent",
        name: input.name,
        approved: input.approved,
        note: input.note,
        url: input.approved ? absoluteUrl(`/agents/${input.slug}`) : absoluteUrl("/dashboard"),
      });
    } catch (err) {
      console.error("[admin/agents] review email failed", {
        agentId: input.agentId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/agents/[id]", async (admin) => {
    const { id } = await params;
    const parsed = await parseJson(req, adminAgentUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const existing = await prisma.agent.findUnique({
      where: { id },
      select: { status: true, publisher: { select: { email: true } } },
    });
    if (!existing) return notFound();

    // Drop unknown scenario slugs before persisting (schema only bounds shape).
    const data = parsed.data.scenarios
      ? { ...parsed.data, scenarios: [...new Set(parsed.data.scenarios.filter(isScenarioSlug))] }
      : parsed.data;

    const agent = await prisma.agent.update({
      where: { id },
      data,
      include: { category: { select: { name: true } } },
    });

    // Status, featured, category and scenarios all feed the cached catalog reads.
    // Without this the approval only surfaces when the 5-minute window lapses.
    revalidateAgents();

    // Only a *transition* is news; re-saving an already-approved agent is not.
    const decided = agent.status === "APPROVED" || agent.status === "REJECTED";
    if (decided && agent.status !== existing.status && existing.publisher.email) {
      notifyReviewOutcome({
        agentId: id,
        email: existing.publisher.email,
        name: agent.name,
        slug: agent.slug,
        approved: agent.status === "APPROVED",
        note: agent.reviewNote,
      });
    }

    await logAdminAction(
      admin.id,
      "update",
      "agent",
      id,
      `Updated: ${Object.keys(parsed.data).join(", ")}`
    );

    return NextResponse.json(agent, { headers: NO_STORE_HEADERS });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/agents/[id]", async (admin) => {
    const { id } = await params;
    const agent = await prisma.agent.findUnique({ where: { id }, select: { name: true } });
    if (!agent) return notFound();

    // AgentSkillDef + AgentTag rows cascade via FK onDelete.
    await prisma.agent.delete({ where: { id } });
    revalidateAgents();
    await logAdminAction(admin.id, "delete", "agent", id, `Deleted: ${agent.name}`);

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  });
}
