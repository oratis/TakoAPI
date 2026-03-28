import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const skill = await prisma.skill.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      category: true,
      submitter: { select: { id: true, name: true, image: true } },
      _count: { select: { likes: true } },
    },
  });

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Increment view count
  await prisma.skill.update({
    where: { id: skill.id },
    data: { viewsCount: { increment: 1 } },
  });

  return NextResponse.json(skill);
}
