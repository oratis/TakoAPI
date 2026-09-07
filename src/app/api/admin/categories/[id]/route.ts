import { NextRequest, NextResponse } from "next/server";
import { withAdmin, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, parseJson } from "@/lib/api";
import { adminCategoryUpdateSchema } from "@/lib/schemas";
import { revalidateCatalog, revalidateCategories } from "@/lib/revalidate";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/categories/[id]", async (admin) => {
    const { id } = await params;
    const parsed = await parseJson(req, adminCategoryUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound();

    const category = await prisma.category.update({ where: { id }, data: parsed.data });

    // A rename is not confined to the category tag: the cached agent and skill
    // cards embed `category.name`, so the whole catalog has to be re-read.
    revalidateCatalog();

    await logAdminAction(admin.id, "update", "category", id, `Updated: ${category.name}`);

    return NextResponse.json(category, { headers: NO_STORE_HEADERS });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/categories/[id]", async (admin) => {
    const { id } = await params;

    const skillCount = await prisma.skill.count({ where: { categoryId: id } });
    if (skillCount > 0) {
      return badRequest(`Cannot delete: ${skillCount} skills still in this category`);
    }

    const category = await prisma.category.delete({ where: { id } });
    revalidateCategories();
    await logAdminAction(admin.id, "delete", "category", id, `Deleted: ${category.name}`);

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  });
}
