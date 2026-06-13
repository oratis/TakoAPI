import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AgentCard from "@/components/ui/AgentCard";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agent Marketplace — TakoAPI",
  description: "One API to access all agents. Discover and invoke AI agents through one unified API.",
};

const PROTOCOLS = ["A2A", "OPENAI_COMPAT", "MCP"];
const PRICING = ["FREE", "PER_CALL", "PER_TASK", "PER_TOKEN"];
const SORTS = [
  { key: "latest", label: "Latest" },
  { key: "popular", label: "Popular" },
  { key: "calls", label: "Most called" },
  { key: "rating", label: "Top rated" },
];
const PAGE_SIZE = 24;

type SP = Record<string, string | undefined>;

function hrefWith(base: SP, patch: SP): string {
  const merged: SP = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/agents?${qs}` : "/agents";
}

function chip(active: boolean): string {
  return `px-3 py-1 rounded-full text-xs font-medium border transition ${
    active
      ? "bg-purple-600 text-white border-purple-600"
      : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
  }`;
}

export default async function AgentsMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const category = sp.category;
  const protocol = PROTOCOLS.includes(sp.protocol || "") ? sp.protocol : undefined;
  const pricing = PRICING.includes(sp.pricing || "") ? sp.pricing : undefined;
  const q = sp.q?.trim() || undefined;
  const sort = SORTS.some((s) => s.key === sp.sort) ? sp.sort! : "latest";
  const page = Math.max(1, parseInt(sp.page || "1") || 1);

  const where: Prisma.AgentWhereInput = { status: "APPROVED" };
  if (category) where.category = { slug: category };
  if (protocol) where.protocols = { has: protocol } as Prisma.AgentWhereInput["protocols"];
  if (pricing) where.pricingModel = pricing as Prisma.AgentWhereInput["pricingModel"];
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.AgentOrderByWithRelationInput =
    sort === "popular"
      ? { likesCount: "desc" }
      : sort === "calls"
        ? { callsCount: "desc" }
        : sort === "rating"
          ? { avgRating: "desc" }
          : { createdAt: "desc" };

  const [agents, total, categories] = await Promise.all([
    prisma.agent.findMany({
      where,
      include: {
        category: { select: { name: true, slug: true } },
        _count: { select: { skills: true } },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.agent.count({ where }),
    prisma.category.findMany({
      where: { agents: { some: { status: "APPROVED" } } },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const base: SP = { category, protocol, pricing, q, sort: sort === "latest" ? undefined : sort };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Agent Marketplace</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
          <span className="font-medium text-purple-600">One API to access all agents.</span>{" "}
          Discover and invoke AI agents through one unified API — described by open A2A AgentCards.
        </p>
      </div>

      {/* Search */}
      <form action="/agents" method="get" className="mb-5 flex gap-2 max-w-xl">
        {protocol && <input type="hidden" name="protocol" value={protocol} />}
        {pricing && <input type="hidden" name="pricing" value={pricing} />}
        {category && <input type="hidden" name="category" value={category} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search agents by name or description…"
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
        <button className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700">
          Search
        </button>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-gray-400 mr-1">Protocol:</span>
        <Link href={hrefWith(base, { protocol: undefined, page: undefined })} className={chip(!protocol)}>
          All
        </Link>
        {PROTOCOLS.map((p) => (
          <Link key={p} href={hrefWith(base, { protocol: p, page: undefined })} className={chip(protocol === p)}>
            {p === "OPENAI_COMPAT" ? "OpenAI" : p}
          </Link>
        ))}
        <span className="text-xs text-gray-400 mx-1 ml-3">Pricing:</span>
        <Link href={hrefWith(base, { pricing: undefined, page: undefined })} className={chip(!pricing)}>
          All
        </Link>
        {PRICING.map((p) => (
          <Link key={p} href={hrefWith(base, { pricing: p, page: undefined })} className={chip(pricing === p)}>
            {p === "FREE" ? "Free" : p.replace("PER_", "").toLowerCase()}
          </Link>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-xs text-gray-400 mr-1">Category:</span>
          <Link href={hrefWith(base, { category: undefined, page: undefined })} className={chip(!category)}>
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={hrefWith(base, { category: c.slug, page: undefined })}
              className={chip(category === c.slug)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {/* Sort + count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {total} agent{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Sort:</span>
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={hrefWith(base, { sort: s.key === "latest" ? undefined : s.key, page: undefined })}
              className={`text-xs ${sort === s.key ? "text-purple-600 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Grid */}
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-500">No agents match your filters yet.</p>
          <Link href="/submit-agent" className="text-purple-600 text-sm font-medium hover:underline mt-2 inline-block">
            Publish the first one →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <AgentCard key={a.slug} agent={a} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          {page > 1 && (
            <Link href={hrefWith(base, { page: String(page - 1) })} className="text-sm text-purple-600 hover:underline">
              ← Prev
            </Link>
          )}
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={hrefWith(base, { page: String(page + 1) })} className="text-sm text-purple-600 hover:underline">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
