import { NextRequest, NextResponse, after } from "next/server";
import { withAdmin, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/api";
import { adminBatchSchema } from "@/lib/schemas";
import { revalidateSkills, revalidateCategories } from "@/lib/revalidate";
import { sendReviewResultEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/seo";
import { NO_STORE_HEADERS } from "@/lib/http";

type Target = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  status: string;
  submitter: { email: string | null } | null;
};

/**
 * Notify everyone whose submission actually changed state in this batch.
 *
 * Deferred with `after` and sent one at a time: a moderator approving 200 skills
 * should not wait on 200 round-trips to Resend, and a batch that already committed
 * must not be reported as failed because a mail bounced. Each failure is logged
 * with its skill id — a silently dropped notification is the thing that makes
 * "why was I never told?" unanswerable.
 */
function notifyBatchOutcome(targets: Target[], approved: boolean, note: string | null) {
  const recipients = targets.filter((t) => t.submitter?.email);
  if (recipients.length === 0) return;

  after(async () => {
    for (const t of recipients) {
      try {
        await sendReviewResultEmail(t.submitter!.email!, {
          kind: "skill",
          name: t.name,
          approved,
          note,
          // A rejected skill has no public page; the dashboard is where its status
          // and the reviewer's note are visible.
          url: approved ? absoluteUrl(`/skills/${t.slug}`) : absoluteUrl("/dashboard"),
        });
      } catch (err) {
        console.error("[admin/skills/batch] review email failed", {
          skillId: t.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

export async function POST(req: NextRequest) {
  return withAdmin(req, "/api/admin/skills/batch", async (admin) => {
    const parsed = await parseJson(req, adminBatchSchema);
    if (!parsed.ok) return parsed.response;
    const { action, ids, reviewNote } = parsed.data;

    let affected = 0;

    // For status/deletion changes we need to keep category.skillCount in sync.
    // skillCount semantics: count of APPROVED skills per category.
    if (action === "approve" || action === "reject" || action === "delete") {
      const targets: Target[] = await prisma.skill.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          slug: true,
          categoryId: true,
          status: true,
          submitter: { select: { email: true } },
        },
      });

      await prisma.$transaction(async (tx) => {
        if (action === "approve") {
          const result = await tx.skill.updateMany({
            where: { id: { in: ids } },
            data: { status: "APPROVED", reviewNote: reviewNote ?? null },
          });
          affected = result.count;
          const deltas = new Map<string, number>();
          for (const t of targets) {
            if (t.status !== "APPROVED") {
              deltas.set(t.categoryId, (deltas.get(t.categoryId) ?? 0) + 1);
            }
          }
          for (const [categoryId, delta] of deltas) {
            await tx.category.update({
              where: { id: categoryId },
              data: { skillCount: { increment: delta } },
            });
          }
        } else if (action === "reject") {
          const result = await tx.skill.updateMany({
            where: { id: { in: ids } },
            data: { status: "REJECTED", reviewNote: reviewNote ?? null },
          });
          affected = result.count;
          const deltas = new Map<string, number>();
          for (const t of targets) {
            if (t.status === "APPROVED") {
              deltas.set(t.categoryId, (deltas.get(t.categoryId) ?? 0) + 1);
            }
          }
          for (const [categoryId, delta] of deltas) {
            await tx.category.update({
              where: { id: categoryId },
              data: { skillCount: { decrement: delta } },
            });
          }
        } else {
          // delete
          await tx.like.deleteMany({ where: { skillId: { in: ids } } });
          const result = await tx.skill.deleteMany({ where: { id: { in: ids } } });
          affected = result.count;
          const deltas = new Map<string, number>();
          for (const t of targets) {
            if (t.status === "APPROVED") {
              deltas.set(t.categoryId, (deltas.get(t.categoryId) ?? 0) + 1);
            }
          }
          for (const [categoryId, delta] of deltas) {
            await tx.category.update({
              where: { id: categoryId },
              data: { skillCount: { decrement: delta } },
            });
          }
        }
      });

      // Only the rows that actually moved are news — re-approving an approved
      // skill should not mail its submitter a second time.
      if (action === "approve") {
        notifyBatchOutcome(
          targets.filter((t) => t.status !== "APPROVED"),
          true,
          reviewNote ?? null
        );
      } else if (action === "reject") {
        notifyBatchOutcome(
          targets.filter((t) => t.status !== "REJECTED"),
          false,
          reviewNote ?? null
        );
      }
    } else {
      const result = await prisma.skill.updateMany({
        where: { id: { in: ids } },
        data: { featured: action === "feature" },
      });
      affected = result.count;
    }

    // Every branch changes what the catalog shows; the category tag covers the
    // skillCount moves the transaction just made.
    revalidateSkills();
    revalidateCategories();

    await logAdminAction(
      admin.id,
      action,
      "skill",
      ids.join(","),
      `Batch ${action}: ${affected} skills${reviewNote ? ` — ${reviewNote}` : ""}`
    );

    return NextResponse.json({ success: true, affected }, { headers: NO_STORE_HEADERS });
  });
}
