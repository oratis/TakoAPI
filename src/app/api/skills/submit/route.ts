import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

async function getUser(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    return prisma.user.findUnique({ where: { apiKey } });
  }
  const session = await auth();
  if (session?.user?.id) {
    return prisma.user.findUnique({ where: { id: session.user.id } });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description, githubUrl, clawSkillsUrl, categoryId } = await req.json();

    if (!name || !description || !categoryId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!githubUrl && !clawSkillsUrl) {
      return NextResponse.json({ error: "Please provide either a GitHub URL or ClawSkills.sh URL" }, { status: 400 });
    }

    // Verify category exists
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    let slug = slugify(name);
    const existing = await prisma.skill.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        slug,
        brief: description,
        description,
        githubUrl: githubUrl || null,
        clawSkillsUrl: clawSkillsUrl || null,
        clawHubUrl: clawSkillsUrl || null,
        installCmd: `clawhub install ${slug}`,
        author: user.name || "unknown",
        categoryId,
        submitterId: user.id,
      },
      include: { category: true },
    });

    // Update category count
    await prisma.category.update({
      where: { id: categoryId },
      data: { skillCount: { increment: 1 } },
    });

    return NextResponse.json(skill);
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
