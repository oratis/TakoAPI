import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CATALOG_TAGS } from "@/lib/catalog";
import { PUBLIC_CACHE_HEADERS } from "@/lib/http";
import { PUBLIC_AGENT_SELECT } from "@/lib/agent-dto";
import type { Prisma } from "@prisma/client";

const BASE = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://takoapi.com";

// The catalog is ~1.6k approved rows, but only the ~50 HOSTED ones are callable
// through the gateway — the rest are open-source repos listed for discovery. A flat
// `take` therefore silently dropped the useful half as soon as the PROJECT rows grew
// past the limit, and the caller had no way to tell. The default response is now
// "every HOSTED agent, then the highest-starred PROJECTs until the budget runs out",
// and every response carries the true totals so a client can see it holds a subset.
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const PROTOCOLS = new Set(["A2A", "OPENAI_COMPAT", "MCP"]);
const SORTS = new Set(["stars", "calls", "rating"]);

/** Free-text params become part of the cache key, so they are length-bounded. */
const MAX_PARAM_LEN = 100;

type Kind = "HOSTED" | "PROJECT";

type RegistryQuery = {
  q: string | null;
  category: string | null;
  protocol: string | null;
  kind: Kind | null;
  sort: string;
  limit: number;
};

const PROJECT_CAVEAT =
  "PROJECT entries are open-source repositories listed for discovery only: they have no TakoAPI endpoint and cannot be invoked through the gateway. Only HOSTED agents are callable.";

// Each projection is a strict subset of the public whitelist in lib/agent-dto:
// `publicColumns` stops compiling the moment a column that is not on that whitelist
// (reviewNote, publisherId, …) is added here. The three shapes differ because the
// two Markdown tables and the JSON body render genuinely different fields — the
// Markdown form needs neither securitySchemes nor the skill rows, only their count.
function publicColumns<K extends keyof typeof PUBLIC_AGENT_SELECT>(keys: readonly K[]) {
  return Object.fromEntries(keys.map((k) => [k, PUBLIC_AGENT_SELECT[k]])) as Pick<
    typeof PUBLIC_AGENT_SELECT,
    K
  >;
}

const MD_HOSTED_SELECT = {
  ...publicColumns(["slug", "name", "description", "protocols", "pricingModel", "unitPriceUsd"]),
  _count: { select: { skills: true } },
} satisfies Prisma.AgentSelect;

const MD_PROJECT_SELECT = publicColumns([
  "slug",
  "name",
  "description",
  "stars",
  "githubUrl",
  "repoOwner",
  "repoName",
]);

const JSON_SELECT = {
  ...publicColumns([
    "slug",
    "name",
    "description",
    "kind",
    "cardUrl",
    "endpointUrl",
    "protocols",
    "streaming",
    "pricingModel",
    "unitPriceUsd",
    "githubUrl",
    "stars",
  ]),
  category: { select: { slug: true } },
  skills: { select: { skillKey: true, name: true } },
} satisfies Prisma.AgentSelect;

function buildWhere(query: RegistryQuery): Prisma.AgentWhereInput {
  const where: Prisma.AgentWhereInput = { status: "APPROVED" };
  if (query.category) where.category = { slug: query.category };
  if (query.protocol) where.protocols = { has: query.protocol } as Prisma.AgentWhereInput["protocols"];
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }
  return where;
}

// PROJECT rows have no call volume and no rating, so the historical default order
// (featured → most-called → newest) would effectively sort them by creation date.
// Stars is the only signal they carry, so it is their default; ?sort= still wins.
function orderFor(sort: string, kind: Kind): Prisma.AgentOrderByWithRelationInput[] {
  switch (sort) {
    case "stars":
      return [{ stars: { sort: "desc", nulls: "last" } }, { callsCount: "desc" }];
    case "calls":
      return [{ callsCount: "desc" }, { createdAt: "desc" }];
    case "rating":
      return [{ avgRating: "desc" }, { ratingCount: "desc" }, { callsCount: "desc" }];
    default:
      return kind === "PROJECT"
        ? [{ stars: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
        : [{ featured: "desc" }, { callsCount: "desc" }, { createdAt: "desc" }];
  }
}

/**
 * Totals and per-kind budgets for one request. The counts ignore ?kind= so the
 * response can always say how much of the *other* kind exists; HOSTED is served
 * first because those are the rows a caller can actually invoke.
 */
async function planQuery(query: RegistryQuery) {
  const where = buildWhere(query);
  // One grouped count rather than two round trips; both numbers are needed on
  // every response, filtered the same way as the rows.
  const groups = await prisma.agent.groupBy({ by: ["kind"], where, _count: { _all: true } });
  const totalHosted = groups.find((g) => g.kind === "HOSTED")?._count._all ?? 0;
  const totalProject = groups.find((g) => g.kind === "PROJECT")?._count._all ?? 0;

  const hostedTake = query.kind === "PROJECT" ? 0 : Math.min(totalHosted, query.limit);
  const projectTake = query.kind === "HOSTED" ? 0 : Math.max(0, query.limit - hostedTake);
  const total = query.kind === "HOSTED" ? totalHosted : query.kind === "PROJECT" ? totalProject : totalHosted + totalProject;

  return { where, totalHosted, totalProject, total, hostedTake, projectTake };
}

type JsonRow = Prisma.AgentGetPayload<{ select: typeof JSON_SELECT }>;

/** Decimal → number, and `invokable` spelled out so an LLM caller cannot miss it. */
function toRegistryAgent(a: JsonRow) {
  return {
    name: a.name,
    slug: a.slug,
    description: a.description,
    url: `${BASE}/agents/${a.slug}`,
    kind: a.kind,
    invokable: a.kind === "HOSTED",
    endpoint: a.endpointUrl,
    github: a.githubUrl,
    stars: a.stars,
    protocols: a.protocols,
    streaming: a.streaming,
    pricing: { model: a.pricingModel, unitUsd: a.unitPriceUsd == null ? null : Number(a.unitPriceUsd) },
    category: a.category?.slug ?? null,
    agentCard: a.cardUrl,
    skills: a.skills.map((s) => ({ id: s.skillKey, name: s.name })),
  };
}

// Both loaders are tagged with CATALOG_TAGS.agents: the ingestion crons and the
// admin moderation writes already call revalidateAgents(), so an approval shows up
// here as soon as it lands rather than waiting out the time bound.
const CACHE_OPTS = { revalidate: 300, tags: [CATALOG_TAGS.agents] };

const getRegistryJson = unstable_cache(
  async (query: RegistryQuery) => {
    const plan = await planQuery(query);
    const [hosted, projects] = await Promise.all([
      plan.hostedTake > 0
        ? prisma.agent.findMany({
            where: { ...plan.where, kind: "HOSTED" },
            select: JSON_SELECT,
            orderBy: orderFor(query.sort, "HOSTED"),
            take: plan.hostedTake,
          })
        : Promise.resolve([] as JsonRow[]),
      plan.projectTake > 0
        ? prisma.agent.findMany({
            where: { ...plan.where, kind: "PROJECT" },
            select: JSON_SELECT,
            orderBy: orderFor(query.sort, "PROJECT"),
            take: plan.projectTake,
          })
        : Promise.resolve([] as JsonRow[]),
    ]);

    const count = hosted.length + projects.length;
    return {
      name: "TakoAPI Agent Registry",
      description: "One API to access all agents.",
      note: PROJECT_CAVEAT,
      count,
      total: plan.total,
      totalHosted: plan.totalHosted,
      totalProject: plan.totalProject,
      returned: { hosted: hosted.length, project: projects.length },
      truncated: count < plan.total,
      agents: [...hosted, ...projects].map(toRegistryAgent),
    };
  },
  ["registry-json-v1"],
  CACHE_OPTS
);

/** Markdown cells are inline table content: no pipes, no newlines, bounded length. */
function cell(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return (flat.length > max ? `${flat.slice(0, max - 1)}…` : flat).replace(/\|/g, "\\|");
}

function priceLabel(pricingModel: string, unitPriceUsd: Prisma.Decimal | null): string {
  if (pricingModel === "FREE") return "Free";
  return `${pricingModel.replace("PER_", "")}${unitPriceUsd == null ? "" : ` $${Number(unitPriceUsd)}`}`;
}

const getRegistryMarkdown = unstable_cache(
  async (query: RegistryQuery) => {
    const plan = await planQuery(query);
    const [hosted, projects] = await Promise.all([
      plan.hostedTake > 0
        ? prisma.agent.findMany({
            where: { ...plan.where, kind: "HOSTED" },
            select: MD_HOSTED_SELECT,
            orderBy: orderFor(query.sort, "HOSTED"),
            take: plan.hostedTake,
          })
        : Promise.resolve([]),
      plan.projectTake > 0
        ? prisma.agent.findMany({
            where: { ...plan.where, kind: "PROJECT" },
            select: MD_PROJECT_SELECT,
            orderBy: orderFor(query.sort, "PROJECT"),
            take: plan.projectTake,
          })
        : Promise.resolve([]),
    ]);

    const count = hosted.length + projects.length;
    let md = `# TakoAPI Agent Registry\n\n`;
    md += `> One API to access all agents.\n`;
    md += `> JSON: ${BASE}/api/registry?format=json\n\n`;
    if (query.q) md += `## Search: "${query.q}"\n\n`;
    md += `Showing ${count} of ${plan.total} matching entries`;
    md += ` — ${hosted.length}/${plan.totalHosted} hosted agents, ${projects.length}/${plan.totalProject} open-source projects.\n`;
    if (count < plan.total) {
      md += `This is a subset. Narrow it with \`?kind=HOSTED\` or \`?kind=PROJECT\`, \`?q=\`, \`?category=\`, \`?protocol=\`, or raise \`?limit=\` (max ${MAX_LIMIT}).\n`;
    }
    md += `\n`;

    md += `## Hosted agents — callable through the TakoAPI gateway\n\n`;
    if (hosted.length) {
      md += `| Agent | Description | Protocols | Pricing | Skills |\n`;
      md += `|-------|-------------|-----------|---------|--------|\n`;
      for (const a of hosted) {
        md += `| [${cell(a.name, 40)}](${BASE}/agents/${a.slug}) | ${cell(a.description)} | ${a.protocols.join(", ")} | ${priceLabel(a.pricingModel, a.unitPriceUsd)} | ${a._count.skills} |\n`;
      }
    } else {
      md += plan.totalHosted
        ? `_None shown for this request. ${plan.totalHosted} available — fetch \`?kind=HOSTED\`._\n`
        : `_No hosted agents match this request._\n`;
    }
    md += `\n`;

    md += `## Open-source projects — discovery only\n\n`;
    md += `${PROJECT_CAVEAT}\n\n`;
    if (projects.length) {
      md += `| Project | Description | Stars | Repo |\n`;
      md += `|---------|-------------|-------|------|\n`;
      for (const a of projects) {
        const repo =
          a.repoOwner && a.repoName
            ? `[${a.repoOwner}/${a.repoName}](${a.githubUrl ?? ""})`
            : a.githubUrl
              ? `[GitHub](${a.githubUrl})`
              : "—";
        md += `| [${cell(a.name, 40)}](${BASE}/agents/${a.slug}) | ${cell(a.description)} | ${a.stars ?? 0} | ${repo} |\n`;
      }
    } else {
      md += plan.totalProject
        ? `_None shown for this request. ${plan.totalProject} available — fetch \`?kind=PROJECT\`._\n`
        : `_No open-source projects match this request._\n`;
    }

    md += `\n---\n`;
    md += `Browse: ${BASE}/agents\n`;
    md += `Publish an agent: POST ${BASE}/api/agents/submit\n`;
    return md;
  },
  ["registry-md-v1"],
  CACHE_OPTS
);

/** Bound and normalize a free-text param — it ends up in the cache key. */
function param(value: string | null): string | null {
  const trimmed = value?.trim().slice(0, MAX_PARAM_LEN);
  return trimmed || null;
}

// Agent-readable curated registry: the "one API to discover all agents" directory.
// Defaults to Markdown (for agents/LLMs); ?format=json for structured A2A-style data.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "json" ? "json" : "md";

  const limitRaw = parseInt(searchParams.get("limit") || "", 10);
  const kindRaw = searchParams.get("kind")?.trim().toUpperCase();
  const protocolRaw = param(searchParams.get("protocol"))?.toUpperCase();
  const sortRaw = (searchParams.get("sort") || "").trim().toLowerCase();

  const query: RegistryQuery = {
    q: param(searchParams.get("q")),
    category: param(searchParams.get("category")),
    protocol: protocolRaw && PROTOCOLS.has(protocolRaw) ? protocolRaw : null,
    kind: kindRaw === "HOSTED" || kindRaw === "PROJECT" ? kindRaw : null,
    sort: SORTS.has(sortRaw) ? sortRaw : "",
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT,
  };

  if (format === "json") {
    return NextResponse.json(await getRegistryJson(query), { headers: PUBLIC_CACHE_HEADERS });
  }
  return new NextResponse(await getRegistryMarkdown(query), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", ...PUBLIC_CACHE_HEADERS },
  });
}
