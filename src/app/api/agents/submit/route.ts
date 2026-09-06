import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { badRequest, parseJson, serverError, unauthorized } from "@/lib/api";
import { resolveApiUser } from "@/lib/api-user";
import { revalidateAgents } from "@/lib/revalidate";
import { submitAgentSchema } from "@/lib/schemas";
import { withRequestLog } from "@/lib/requestLog";
import { fetchAgentCard, AgentCardError, type ParsedAgentCard } from "@/lib/agentcard";
import { classifyScenarios, isScenarioSlug } from "@/lib/scenarios";

// A colliding slug used to get `Date.now().toString(36)` appended, so the second
// "Weather Oracle" was published at `weather-oracle-m4k2p1` — a URL nobody can
// read, guess or repeat. Number the duplicates instead: `-2`, `-3`, …
async function nextFreeSlug(base: string): Promise<string> {
  const rows = await prisma.agent.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(base)) return base;
  // Terminates: `taken` is finite, so some suffix in the sequence is free.
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Prisma's unique-constraint violation, narrowed without importing the error class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function POST(req: NextRequest) {
  return withRequestLog(req, "/api/agents/submit", async (logCtx) => {
    const rl = await checkRateLimit(req, { key: "agent-submit", windowMs: 60 * 60 * 1000, max: 20 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const user = await resolveApiUser(req);
    if (!user) return unauthorized();
    // Auto-approval stays a programmatic affordance for admin tooling: an admin
    // publishing through the browser form still lands in the review queue.
    const autoApprove = user.role === "admin" && user.via !== "session";
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
        // Field-scoped, like POST /api/agents/validate-card: the failure is always
        // about the URL that was typed, so the form can render it against that
        // input instead of a bar at the bottom of the page.
        const message =
          e instanceof AgentCardError
            ? `AgentCard error: ${e.message}`
            : "Could not fetch or parse the AgentCard";
        return badRequest(message, [{ path: "cardUrl", message }]);
      }
    }

    if (!name || !endpointUrl) {
      const missing = [
        ...(name ? [] : [{ path: "name", message: "An agent name is required" }]),
        ...(endpointUrl ? [] : [{ path: "endpointUrl", message: "An endpoint URL is required" }]),
      ];
      return badRequest("Missing required agent fields (name, endpointUrl)", missing);
    }

    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) {
        return badRequest("Invalid category", [
          { path: "categoryId", message: "Invalid category" },
        ]);
      }
    }

    const baseSlug = slugify(name);
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

    // Typed here so `status` keeps its enum type: the object is built outside the
    // insert (the slug is chosen per attempt), which would otherwise widen it to string.
    const data: Omit<Prisma.AgentUncheckedCreateInput, "slug"> = {
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
    };

    // Two submissions of the same name can pick the same free slug before either
    // insert lands. The unique index catches that, so re-number and retry rather
    // than handing the publisher a 500 for someone else's timing.
    for (let attempt = 0; ; attempt++) {
      const slug = await nextFreeSlug(baseSlug);
      try {
        const agent = await prisma.agent.create({
          data: { ...data, slug },
          include: {
            skills: true,
            category: { select: { name: true, slug: true } },
          },
        });
        // Only an auto-approved agent is visible to the public catalog; a PENDING
        // one changes nothing a visitor can see, so there is nothing to bust.
        if (status === "APPROVED") revalidateAgents();
        return NextResponse.json(agent, { status: 201 });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 2) continue;
        console.error("Agent submit error:", error);
        return serverError();
      }
    }
  });
}
