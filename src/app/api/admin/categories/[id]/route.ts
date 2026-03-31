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
  const { name, description, icon } = await req.json();

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(icon !== undefined ? { icon } : {}),
    },
  });

  await logAdminAction(admin.id, "update", "category", id, `Updated: ${category.name}`);

  return NextResponse.json(category);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;

  const skillCount = await prisma.skill.count({ where: { categoryId: id } });
  if (skillCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${skillCount} skills still in this category` },
      { status: 400 }
    );
  }

  const category = await prisma.category.delete({ where: { id } });
  await logAdminAction(admin.id, "delete", "category", id, `Deleted: ${category.name}`);

  return NextResponse.json({ success: true });
}
