import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import type { SkillStatus } from "@prisma/client";

const ALLOWED_FIELDS = [
  "name",
  "brief",
  "description",
  "readme",
  "githubUrl",
  "clawHubUrl",
  "clawSkillsUrl",
  "installCmd",
  "author",
  "categoryId",
  "status",
  "featured",
  "reviewNote",
] as const;

const VALID_STATUSES: SkillStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;
  const data = await req.json();

  const updateData: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }

  if (updateData.status && !VALID_STATUSES.includes(updateData.status as SkillStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.skill.findUnique({
    where: { id },
    select: { status: true, categoryId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  await logAdminAction(
    admin.id,
    "update",
    "skill",
    id,
    `Updated: ${Object.keys(updateData).join(", ")}`
  );

  return NextResponse.json(skill);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;

  const skill = await prisma.skill.findUnique({
    where: { id },
    select: { name: true, categoryId: true, status: true },
  });
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  await logAdminAction(admin.id, "delete", "skill", id, `Deleted: ${skill.name}`);

  return NextResponse.json({ success: true });
}
