import { NextRequest, NextResponse, after } from "next/server";
import { withAdmin, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { notFound, parseJson } from "@/lib/api";
import { adminSkillUpdateSchema } from "@/lib/schemas";
import { revalidateSkills, revalidateCategories } from "@/lib/revalidate";
import { sendReviewResultEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/seo";
import { NO_STORE_HEADERS } from "@/lib/http";

/**
 * Tell the submitter what the moderator decided.
 *
 * Deferred with `after` so the mail never sits between the moderator and their
 * response, and never fails the moderation: a skill that was approved in the
 * database stays approved even if Resend is down. Failures are logged with the
 * skill id so a missing notification can be traced.
 *
 * A rejected skill is not publicly reachable, so the "resubmit" link goes to the
 * dashboard, where the submitter can see the status and the reviewer's note.
 */
function notifyReviewOutcome(input: {
  skillId: string;
  email: string;
  name: string;
  slug: string;
  approved: boolean;
  note: string | null;
}) {
  after(async () => {
    try {
      await sendReviewResultEmail(input.email, {
        kind: "skill",
        name: input.name,
        approved: input.approved,
        note: input.note,
        url: input.approved ? absoluteUrl(`/skills/${input.slug}`) : absoluteUrl("/dashboard"),
      });
    } catch (err) {
      console.error("[admin/skills] review email failed", {
        skillId: input.skillId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/skills/[id]", async (admin) => {
    const { id } = await params;
    const parsed = await parseJson(req, adminSkillUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updateData = parsed.data;

    const existing = await prisma.skill.findUnique({
      where: { id },
      select: { status: true, categoryId: true, submitter: { select: { email: true } } },
    });
    if (!existing) return notFound();

    const skill = await prisma.$transaction(async (tx) => {
      const updated = await tx.skill.update({
        where: { id },
        data: updateData,
        include: { category: { select: { name: true } } },
      });

      // Keep category.skillCount in sync when status or category change
      const wasApproved = existing.status === "APPROVED";
      const isApproved = updated.status === "APPROVED";
      const categoryChanged = existing.categoryId !== updated.categoryId;

      if (!wasApproved && isApproved) {
        await tx.category.update({
          where: { id: updated.categoryId },
          data: { skillCount: { increment: 1 } },
        });
      } else if (wasApproved && !isApproved) {
        await tx.category.update({
          where: { id: existing.categoryId },
          data: { skillCount: { decrement: 1 } },
        });
      } else if (wasApproved && isApproved && categoryChanged) {
        await tx.category.update({
          where: { id: existing.categoryId },
          data: { skillCount: { decrement: 1 } },
        });
        await tx.category.update({
          where: { id: updated.categoryId },
          data: { skillCount: { increment: 1 } },
        });
      }
      return updated;
    });

    // The skill itself, and category.skillCount, which the transaction above may
    // have moved — the categories tag backs the skills filter row.
    revalidateSkills();
    revalidateCategories();

    // Only a *transition* is news; re-saving an already-approved skill is not.
    const decided = skill.status === "APPROVED" || skill.status === "REJECTED";
    if (decided && skill.status !== existing.status && existing.submitter?.email) {
      notifyReviewOutcome({
        skillId: id,
        email: existing.submitter.email,
        name: skill.name,
        slug: skill.slug,
        approved: skill.status === "APPROVED",
        note: skill.reviewNote,
      });
    }

    await logAdminAction(
      admin.id,
      "update",
      "skill",
      id,
      `Updated: ${Object.keys(updateData).join(", ")}`
    );

    return NextResponse.json(skill, { headers: NO_STORE_HEADERS });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/skills/[id]", async (admin) => {
    const { id } = await params;

    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { name: true, categoryId: true, status: true },
    });
    if (!skill) return notFound();

    await prisma.$transaction(async (tx) => {
      await tx.like.deleteMany({ where: { skillId: id } });
      await tx.skill.delete({ where: { id } });
      if (skill.status === "APPROVED") {
        await tx.category.update({
          where: { id: skill.categoryId },
          data: { skillCount: { decrement: 1 } },
        });
      }
    });

    revalidateSkills();
    revalidateCategories();

    await logAdminAction(admin.id, "delete", "skill", id, `Deleted: ${skill.name}`);

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  });
}
