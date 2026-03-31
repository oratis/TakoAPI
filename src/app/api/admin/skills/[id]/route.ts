import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;
  const data = await req.json();

  // Only allow specific fields
  const allowed = ["name", "brief", "description", "readme", "githubUrl", "clawHubUrl", "clawSkillsUrl", "installCmd", "author", "categoryId", "status", "featured"];
  const updateData: Record<string, unknown> = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }

  const skill = await prisma.skill.update({
    where: { id },
    data: updateData,
    include: { category: { select: { name: true } } },
  });

  await logAdminAction(admin.id, "update", "skill", id, `Updated: ${Object.keys(updateData).join(", ")}`);

  return NextResponse.json(skill);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;

  const skill = await prisma.skill.findUnique({ where: { id }, select: { name: true, categoryId: true } });
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete likes first, then skill
  await prisma.like.deleteMany({ where: { skillId: id } });
  await prisma.skill.delete({ where: { id } });

  // Update category count
  await prisma.category.update({
    where: { id: skill.categoryId },
    data: { skillCount: { decrement: 1 } },
  });

  await logAdminAction(admin.id, "delete", "skill", id, `Deleted: ${skill.name}`);

  return NextResponse.json({ success: true });
}
