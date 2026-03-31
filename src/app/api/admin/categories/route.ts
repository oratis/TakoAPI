import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const categories = await prisma.category.findMany({
    orderBy: { skillCount: "desc" },
    include: { _count: { select: { skills: true } } },
  });

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { name, description, icon } = await req.json();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const slug = slugify(name);
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "Category already exists" }, { status: 409 });

  const category = await prisma.category.create({
    data: { name, slug, description: description || null, icon: icon || null },
  });

  await logAdminAction(admin.id, "create", "category", category.id, `Created: ${name}`);

  return NextResponse.json(category);
}
