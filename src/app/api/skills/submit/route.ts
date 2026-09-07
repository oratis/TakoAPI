import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiUser } from "@/lib/api-user";
import { slugify } from "@/lib/utils";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { badRequest, parseJson, serverError, unauthorized } from "@/lib/api";
import { submitSkillSchema } from "@/lib/schemas";
import { withRequestLog } from "@/lib/requestLog";

async function getSubmitter(req: NextRequest) {
  const user = await resolveApiUser(req);
  if (!user) return null;
  // Auto-approval is a moderation bypass, so it stays with the credential that was
  // always meant to carry it: an admin's single-purpose legacy key. A gateway key
  // (tako_live_…) is handed to MCP clients and CI, so it submits like anyone else
  // and waits for review, even when its owner is an admin.
  const autoApprove = user.role === "admin" && user.via === "legacy-apikey";
  return { user, autoApprove };
}

export async function POST(req: NextRequest) {
  return withRequestLog(req, "/api/skills/submit", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "submit", windowMs: 60 * 60 * 1000, max: 20 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const ctx = await getSubmitter(req);
    if (!ctx) return unauthorized();
    const { user, autoApprove } = ctx;
    logCtx.userId = user.id;

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

      // Only skills that actually live on ClawSkills/ClawHub have an install
      // command, and it must use *their* slug (from the URL), not ours — a
      // `clawhub install <our-slug>` for a GitHub-only skill is a command that
      // fails for everyone who copies it.
      const clawSlug = clawSkillsUrl ? clawSkillsUrl.match(/\/skills\/([^/?#]+)/)?.[1] ?? null : null;
      const installCmd = clawSlug ? `clawhub install ${clawSlug}` : null;

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
            installCmd,
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
  });
}
