import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { badRequest, parseJson, serverError, unauthorized } from "@/lib/api";
import { submitAgentSchema } from "@/lib/schemas";
import { withRequestLog } from "@/lib/requestLog";
import { fetchAgentCard, AgentCardError, type ParsedAgentCard } from "@/lib/agentcard";
import { classifyScenarios, isScenarioSlug } from "@/lib/scenarios";

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
  return withRequestLog(req, "/api/agents/submit", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "agent-submit", windowMs: 60 * 60 * 1000, max: 20 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const ctx = await getSubmitter(req);
    if (!ctx) return unauthorized();
    const { user, autoApprove } = ctx;
    logCtx.userId = user.id;

    const parsed = await parseJson(req, submitAgentSchema);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;

    // Resolve agent fields from the AgentCard (if a URL was given) + manual overrides.
    let name = input.name?.trim() || "";
    let description = input.description?.trim() || "";
    let endpointUrl = input.endpointUrl?.trim() || "";
    let cardUrl: string | null = input.cardUrl?.trim() || null;
    let streaming = false;
    let pushNotify = false;
    let securitySchemes: ParsedAgentCard["securitySchemes"] = null;
    let cardSkills: ParsedAgentCard["skills"] = [];

    if (input.cardUrl) {
      try {
        const card = await fetchAgentCard(input.cardUrl);
        name = name || card.name;
        description = description || card.description;
        endpointUrl = endpointUrl || card.endpointUrl;
        cardUrl = card.cardUrl;
        streaming = card.streaming;
        pushNotify = card.pushNotify;
        securitySchemes = card.securitySchemes;
        cardSkills = card.skills;
      } catch (e) {
        if (e instanceof AgentCardError) return badRequest(`AgentCard error: ${e.message}`);
        return badRequest("Could not fetch or parse the AgentCard");
      }
    }

    if (!name || !endpointUrl) {
      return badRequest("Missing required agent fields (name, endpointUrl)");
    }

    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) return badRequest("Invalid category");
    }

    let slug = slugify(name);
    const existing = await prisma.agent.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const status = autoApprove ? "APPROVED" : "PENDING";
    const protocols = input.protocols?.length ? input.protocols : (["A2A"] as const);

    // Use an explicit scenario override (valid slugs only) if provided;
    // otherwise auto-classify from the name, description, and advertised skills.
    const overrideScenarios = input.scenarios?.filter(isScenarioSlug) ?? [];
    const scenarios = overrideScenarios.length
      ? [...new Set(overrideScenarios)]
      : classifyScenarios(
          [name, description, ...cardSkills.map((s) => `${s.name} ${s.description ?? ""}`)].join(" ")
        );

    try {
      const agent = await prisma.agent.create({
        data: {
          slug,
          name,
          description,
          publisherId: user.id,
          categoryId: input.categoryId || null,
          status,
          cardUrl,
          endpointUrl,
          protocols: [...protocols],
          streaming,
          pushNotify,
          securitySchemes:
            securitySchemes == null ? undefined : (securitySchemes as Prisma.InputJsonValue),
          cardFetchedAt: input.cardUrl ? new Date() : null,
          homepage: input.homepage || null,
          pricingModel: input.pricingModel || "FREE",
          unitPriceUsd: input.unitPriceUsd ?? null,
          scenarios,
          skills: cardSkills.length
            ? {
                create: cardSkills.map((s) => ({
                  skillKey: s.skillKey,
                  name: s.name,
                  description: s.description,
                  inputModes: s.inputModes,
                  outputModes: s.outputModes,
                  examples: s.examples,
                })),
              }
            : undefined,
        },
        include: {
          skills: true,
          category: { select: { name: true, slug: true } },
        },
      });
      return NextResponse.json(agent, { status: 201 });
    } catch (error) {
      console.error("Agent submit error:", error);
      return serverError();
    }
  });
}
