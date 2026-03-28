import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  let userId: string | null = null;

  if (apiKey) {
    const user = await prisma.user.findUnique({ where: { apiKey } });
    userId = user?.id || null;
  } else {
    const session = await auth();
    userId = session?.user?.id || null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skills = await prisma.skill.findMany({
    where: { submitterId: userId },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    totalSkills: skills.length,
    totalLikes: skills.reduce((sum, s) => sum + s.likesCount, 0),
    totalViews: skills.reduce((sum, s) => sum + s.viewsCount, 0),
  };

  return NextResponse.json({ skills, stats });
}
