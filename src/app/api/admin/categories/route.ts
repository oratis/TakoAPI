import { NextRequest, NextResponse } from "next/server";
import { withAdmin, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { conflict, parseJson } from "@/lib/api";
import { adminCategoryCreateSchema } from "@/lib/schemas";
import { revalidateCategories } from "@/lib/revalidate";
import { slugify } from "@/lib/utils";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/categories", async () => {
    const categories = await prisma.category.findMany({
      orderBy: { skillCount: "desc" },
      include: { _count: { select: { skills: true } } },
    });

    return NextResponse.json(categories, { headers: NO_STORE_HEADERS });
  });
}

export async function POST(req: NextRequest) {
  return withAdmin(req, "/api/admin/categories", async (admin) => {
    const parsed = await parseJson(req, adminCategoryCreateSchema);
    if (!parsed.ok) return parsed.response;
    const { name, description, icon } = parsed.data;

    const slug = slugify(name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) return conflict("Category already exists");

    const category = await prisma.category.create({
      data: { name, slug, description: description ?? null, icon: icon ?? null },
    });

    // The category filter rows on the skills and marketplace pages are cached.
    revalidateCategories();

    await logAdminAction(admin.id, "create", "category", category.id, `Created: ${name}`);

    return NextResponse.json(category, { headers: NO_STORE_HEADERS });
  });
}
