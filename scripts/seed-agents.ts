/**
 * Seed the agent registry with a curated list of REAL agents.
 *
 * Fill AGENTS below with agents you control or have consent to list (real
 * endpoints / A2A AgentCard URLs). Then run:
 *   npx tsx scripts/seed-agents.ts
 * Requires DATABASE_URL set and an admin user to attribute them to.
 *
 * NOTE: left empty on purpose — do NOT seed fake/placeholder agents onto the
 * live marketplace. For card-based onboarding, prefer POST /api/agents/submit
 * with an `x-api-key` admin key (auto-approves) or the /submit-agent UI.
 */
import { PrismaClient } from "@prisma/client";

type Protocol = "A2A" | "OPENAI_COMPAT" | "MCP";
type Pricing = "FREE" | "PER_CALL" | "PER_TASK" | "PER_TOKEN";

type SeedAgent = {
  name: string;
  description: string;
  endpointUrl: string;
  protocols?: Protocol[];
  pricingModel?: Pricing;
  unitPriceUsd?: number;
  homepage?: string;
  categorySlug?: string;
};

// ⚠️ Add REAL agents here before running against production.
const AGENTS: SeedAgent[] = [
  // {
  //   name: "Example Agent",
  //   description: "What it does.",
  //   endpointUrl: "https://example.com/a2a",
  //   protocols: ["A2A"],
  //   pricingModel: "FREE",
  //   homepage: "https://example.com",
  //   categorySlug: "coding-agents-and-ides",
  // },
];

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  if (AGENTS.length === 0) {
    console.log("No agents to seed — fill AGENTS in scripts/seed-agents.ts first.");
    return;
  }
  const publisher = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!publisher) throw new Error("No admin user found to attribute agents to.");

  for (const a of AGENTS) {
    const slug = slugify(a.name);
    const cat = a.categorySlug
      ? await prisma.category.findUnique({ where: { slug: a.categorySlug } })
      : null;
    await prisma.agent.upsert({
      where: { slug },
      update: { description: a.description, endpointUrl: a.endpointUrl },
      create: {
        slug,
        name: a.name,
        description: a.description,
        endpointUrl: a.endpointUrl,
        protocols: a.protocols ?? ["A2A"],
        pricingModel: a.pricingModel ?? "FREE",
        unitPriceUsd: a.unitPriceUsd ?? null,
        homepage: a.homepage ?? null,
        categoryId: cat?.id ?? null,
        publisherId: publisher.id,
        status: "APPROVED",
      },
    });
    console.log("seeded", slug);
  }
  console.log(`Done — ${AGENTS.length} agent(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
