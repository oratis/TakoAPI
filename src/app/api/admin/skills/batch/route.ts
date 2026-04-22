import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type BatchAction = "approve" | "reject" | "feature" | "unfeature" | "delete";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { action, ids, reviewNote } = (await req.json()) as {
    action: BatchAction;
    ids: string[];
    reviewNote?: string;
  };

  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Missing action or ids" }, { status: 400 });
  }

  let affected = 0;

  // For status/deletion changes we need to keep category.skillCount in sync.
  // skillCount semantics: count of APPROVED skills per category.
  if (action === "approve" || action === "reject" || action === "delete") {
    const targets = await prisma.skill.findMany({
      where: { id: { in: ids } },
      select: { id: true, categoryId: true, status: true },
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
  } else if (action === "feature" || action === "unfeature") {
    const result = await prisma.skill.updateMany({
      where: { id: { in: ids } },
      data: { featured: action === "feature" },
    });
    affected = result.count;
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await logAdminAction(
    admin.id,
    action,
    "skill",
    ids.join(","),
    `Batch ${action}: ${affected} skills${reviewNote ? ` — ${reviewNote}` : ""}`
  );

  return NextResponse.json({ success: true, affected });
}
