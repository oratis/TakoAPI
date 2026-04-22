import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { badRequest, parseJson, serverError, unauthorized } from "@/lib/api";
import { submitSkillSchema } from "@/lib/schemas";

async function getSubmitter(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const user = await prisma.user.findUnique({ where: { apiKey } });
    if (!user) return null;
    return { user, autoApprove: user.role === "admin" };
  }
  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return null;
    return { user, autoApprove: false };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { key: "submit", windowMs: 60 * 60 * 1000, max: 20 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const ctx = await getSubmitter(req);
  if (!ctx) return unauthorized();
  const { user, autoApprove } = ctx;

  const parsed = await parseJson(req, submitSkillSchema);
  if (!parsed.ok) return parsed.response;
  const { name, brief, description, readme, githubUrl, clawSkillsUrl, categoryId } = parsed.data;

  try {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return badRequest("Invalid category");

    let slug = slugify(name);
    const existing = await prisma.skill.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const status = autoApprove ? "APPROVED" : "PENDING";

    const skill = await prisma.$transaction(async (tx) => {
      const created = await tx.skill.create({
        data: {
          name,
          slug,
          brief: brief || description || "",
          description: description || brief || "",
          readme: readme || null,
          githubUrl: githubUrl || null,
          clawSkillsUrl: clawSkillsUrl || null,
          clawHubUrl: clawSkillsUrl || null,
          installCmd: `clawhub install ${slug}`,
          author: user.name || "unknown",
          categoryId,
          submitterId: user.id,
          status,
        },
        include: { category: true },
      });
      if (status === "APPROVED") {
        await tx.category.update({
          where: { id: categoryId },
          data: { skillCount: { increment: 1 } },
        });
      }
      return created;
    });

    return NextResponse.json(skill);
  } catch (error) {
    console.error("Submit error:", error);
    return serverError();
  }
}
