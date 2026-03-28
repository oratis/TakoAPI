import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUser(req: NextRequest) {
  // Check API key first (for OpenClaw agents)
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    return prisma.user.findUnique({ where: { apiKey } });
  }
  // Then check session
  const session = await auth();
  if (session?.user?.id) {
    return prisma.user.findUnique({ where: { id: session.user.id } });
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const skill = await prisma.skill.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const existingLike = await prisma.like.findUnique({
    where: { userId_skillId: { userId: user.id, skillId: skill.id } },
  });

  if (existingLike) {
    // Unlike
    await prisma.like.delete({ where: { id: existingLike.id } });
    await prisma.skill.update({
      where: { id: skill.id },
      data: { likesCount: { decrement: 1 } },
    });
    return NextResponse.json({ liked: false });
  } else {
    // Like
    await prisma.like.create({
      data: { userId: user.id, skillId: skill.id },
    });
    await prisma.skill.update({
      where: { id: skill.id },
      data: { likesCount: { increment: 1 } },
    });
    return NextResponse.json({ liked: true });
  }
}
