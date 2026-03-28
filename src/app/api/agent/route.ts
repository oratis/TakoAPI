import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Agent-readable markdown endpoint for OpenClaw
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const format = searchParams.get("format") || "md";

  const where = {
    ...(category ? { category: { slug: category } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const skills = await prisma.skill.findMany({
    where,
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { likesCount: "desc" },
    take: 100,
  });

  if (format === "json") {
    return NextResponse.json(
      skills.map((s) => ({
        name: s.name,
        slug: s.slug,
        description: s.description,
        category: s.category.name,
        install: s.installCmd,
        github: s.githubUrl,
        likes: s.likesCount,
      }))
    );
  }

  // Markdown format for agent consumption
  let md = `# TakoAPI - OpenClaw Skills Directory\n\n`;
  md += `> All in One OpenClaw Skills Marketplace\n`;
  md += `> API: https://takoapi.com/api/agent?format=json\n\n`;

  if (q) md += `## Search: "${q}"\n\n`;
  if (category) md += `## Category: ${category}\n\n`;

  md += `| Skill | Description | Install | Likes |\n`;
  md += `|-------|-------------|---------|-------|\n`;

  for (const s of skills) {
    md += `| [${s.name}](https://takoapi.com/skills/${s.slug}) | ${s.description.slice(0, 80)} | \`clawhub install ${s.slug}\` | ${s.likesCount} |\n`;
  }

  md += `\n---\n`;
  md += `Browse more at https://takoapi.com\n`;
  md += `Submit skills: POST https://takoapi.com/api/skills/submit\n`;
  md += `Register agent: POST https://takoapi.com/api/auth/register { "email": "...", "isAgent": true }\n`;

  return new NextResponse(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
