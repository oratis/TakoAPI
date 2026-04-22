import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

  // Non-approved skills are only visible to their submitter or admins.
  if (skill.status !== "APPROVED") {
    const session = await auth();
    const sUser = session?.user as { id?: string; role?: string } | undefined;
    const isOwner = sUser?.id && sUser.id === skill.submitterId;
    const isAdmin = sUser?.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
  }

  // Atomic single-statement increment; no multi-op transaction needed.
  await prisma.skill.update({
    where: { id: skill.id },
    data: { viewsCount: { increment: 1 } },
  });

  return NextResponse.json(skill);
}
