import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { PUBLIC_CACHE_HEADERS } from "@/lib/http";
import { SITE_URL } from "@/lib/seo";

// Agent-readable skills directory (Markdown by default, ?format=json), consumed by
// the installed TakoAPI skill / MCP `search_skills`. Public catalog only: PENDING and
// REJECTED rows must never appear here. Search is case-insensitive, paginated, and
// the response is CDN-cacheable — the catalog changes nightly, not per request.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q")?.trim() || "";
  const format = searchParams.get("format") || "md";
  const { page, limit, skip } = clampPagination({
    get: (k) => (k === "limit" ? (searchParams.get("limit") ?? "50") : searchParams.get(k)),
  });

  const where = {
    status: "APPROVED" as const,
    ...(category ? { category: { slug: category } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      select: {
        name: true,
        slug: true,
        description: true,
        installCmd: true,
        githubUrl: true,
        clawSkillsUrl: true,
        likesCount: true,
        downloads: true,
        stars: true,
        category: { select: { name: true, slug: true } },
      },
      orderBy: [{ downloads: "desc" }, { likesCount: "desc" }],
      skip,
      take: limit,
    }),
    prisma.skill.count({ where }),
  ]);

  if (format === "json") {
    return NextResponse.json(
      {
        count: skills.length,
        total,
        page,
        limit,
        skills: skills.map((s) => ({
          name: s.name,
          slug: s.slug,
          description: s.description,
          category: s.category.name,
          url: `${SITE_URL}/skills/${s.slug}`,
          install: s.installCmd,
          github: s.githubUrl,
          clawskills: s.clawSkillsUrl,
          downloads: s.downloads,
          stars: s.stars,
          likes: s.likesCount,
        })),
      },
      { headers: PUBLIC_CACHE_HEADERS }
    );
  }

  // Markdown format for agent consumption
  let md = `# TakoAPI - Skills Directory\n\n`;
  md += `> Coding-agent skills, curated by TakoAPI (${SITE_URL})\n`;
  md += `> JSON: ${SITE_URL}/api/agent?format=json · page ${page} of ${Math.max(1, Math.ceil(total / limit))} (${total} skills)\n\n`;

  if (q) md += `## Search: "${q}"\n\n`;
  if (category) md += `## Category: ${category}\n\n`;

  md += `| Skill | Description | Install | Downloads |\n`;
  md += `|-------|-------------|---------|-----------|\n`;

  for (const s of skills) {
    const install = s.installCmd ? `\`${s.installCmd}\`` : s.githubUrl ? `[GitHub](${s.githubUrl})` : "—";
    md += `| [${s.name}](${SITE_URL}/skills/${s.slug}) | ${s.description.replace(/\|/g, "\\|").slice(0, 80)} | ${install} | ${s.downloads} |\n`;
  }

  md += `\n---\n`;
  md += `Browse more at ${SITE_URL}/skills\n`;
  md += `Submit skills: POST ${SITE_URL}/api/skills/submit\n`;
  md += `Agents & gateway: ${SITE_URL}/api/registry\n`;

  return new NextResponse(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", ...PUBLIC_CACHE_HEADERS },
  });
}
