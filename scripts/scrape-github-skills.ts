// Scrape high-star GitHub repos for coding agents and import them as skills.
//
// Usage:
//   GITHUB_TOKEN=ghp_... DATABASE_URL=... npx tsx scripts/scrape-github-skills.ts [agent] [limit]
//   agent: claude-code | cursor | windsurf | codex | aider | cline | copilot | generic | all (default: all)
//   limit: max repos per agent (default: 50)
//
// The script queries GitHub search by topic/keyword, fetches each repo + README,
// and upserts a Skill row with source=GITHUB_SCRAPE. It preserves any existing
// non-GitHub-scrape skills at the same slug (won't clobber user submissions).
import { PrismaClient, Prisma } from "@prisma/client";
import { fetchRepo, fetchReadme, searchRepos } from "../src/lib/github";

const prisma = new PrismaClient();

type AgentKey = "claude-code" | "cursor" | "windsurf" | "codex" | "aider" | "cline" | "copilot" | "generic";

const AGENT_SPECS: Record<AgentKey, {
  enum: "CLAUDE_CODE" | "CURSOR" | "WINDSURF" | "CODEX" | "AIDER" | "CLINE" | "COPILOT" | "GENERIC";
  categorySlug: string;
  queries: string[];
}> = {
  "claude-code": {
    enum: "CLAUDE_CODE",
    categorySlug: "claude-code",
    queries: [
      "claude-code topic:claude-code",
      "claude-code skill in:name,description",
      "claude-code agent in:name,description",
      "topic:claude-code-skills",
    ],
  },
  cursor: {
    enum: "CURSOR",
    categorySlug: "cursor",
    queries: [
      "cursor-rules topic:cursor-rules",
      "cursor ide rules in:name,description",
      "topic:cursor-ai",
    ],
  },
  windsurf: {
    enum: "WINDSURF",
    categorySlug: "windsurf",
    queries: [
      "windsurf rules in:name,description",
      "windsurf cascade in:name,description",
    ],
  },
  codex: {
    enum: "CODEX",
    categorySlug: "codex",
    queries: [
      "openai codex cli in:name,description",
      "codex agent in:name,description stars:>50",
    ],
  },
  aider: {
    enum: "AIDER",
    categorySlug: "aider",
    queries: [
      "aider chat in:name,description",
      "topic:aider",
    ],
  },
  cline: {
    enum: "CLINE",
    categorySlug: "cline",
    queries: [
      "cline vscode in:name,description",
      "topic:cline",
    ],
  },
  copilot: {
    enum: "COPILOT",
    categorySlug: "copilot",
    queries: [
      "copilot instructions in:name,description",
      "github-copilot custom in:name,description",
    ],
  },
  generic: {
    enum: "GENERIC",
    categorySlug: "generic-ai",
    queries: [
      "ai coding agent in:name,description stars:>100",
      "llm coding agent in:name,description stars:>100",
    ],
  },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function ensureCategory(slug: string, name: string): Promise<string> {
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name, slug, icon: null, description: `${name} related skills` },
  });
  return created.id;
}

async function importRepo(
  agent: AgentKey,
  item: { owner: string; repo: string; description: string | null; stars: number; htmlUrl: string; topics: string[] },
  categoryId: string
): Promise<"created" | "updated" | "skipped"> {
  const slug = slugify(`${agent}-${item.owner}-${item.repo}`);

  const existing = await prisma.skill.findUnique({ where: { slug } });
  if (existing && existing.source !== "GITHUB_SCRAPE") {
    return "skipped";
  }

  const repo = await fetchRepo(item.owner, item.repo);
  if (!repo) return "skipped";
  const readme = await fetchReadme(item.owner, item.repo, repo.defaultBranch);

  const brief = (repo.description || item.description || "").slice(0, 500);
  const description = brief || `${item.owner}/${item.repo}`;

  const data: Prisma.SkillUncheckedCreateInput = {
    name: item.repo,
    slug,
    brief,
    description,
    readme: readme || null,
    githubUrl: repo.htmlUrl,
    clawSkillsUrl: null,
    clawHubUrl: null,
    installCmd: `clawhub install ${slug}`,
    author: item.owner,
    categoryId,
    submitterId: null,
    status: "APPROVED",
    agentType: AGENT_SPECS[agent].enum,
    source: "GITHUB_SCRAPE",
    sourceUrl: repo.htmlUrl,
    ghStars: repo.stars,
    ghOwner: item.owner,
    ghRepo: item.repo,
    stars: repo.stars,
  };

  if (existing) {
    await prisma.skill.update({
      where: { id: existing.id },
      data: {
        brief: data.brief,
        description: data.description,
        readme: data.readme,
        ghStars: data.ghStars,
        stars: data.stars,
        sourceUrl: data.sourceUrl,
        agentType: data.agentType,
      },
    });
    return "updated";
  }

  await prisma.$transaction(async (tx) => {
    await tx.skill.create({ data });
    await tx.category.update({
      where: { id: categoryId },
      data: { skillCount: { increment: 1 } },
    });
  });
  return "created";
}

async function runForAgent(agent: AgentKey, limit: number): Promise<void> {
  const spec = AGENT_SPECS[agent];
  const categoryName = agent.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const categoryId = await ensureCategory(spec.categorySlug, categoryName);

  const seen = new Set<string>();
  const aggregated: Array<{ owner: string; repo: string; description: string | null; stars: number; htmlUrl: string; topics: string[] }> = [];

  for (const q of spec.queries) {
    if (aggregated.length >= limit) break;
    try {
      const batch = await searchRepos(q, { perPage: 30, sort: "stars" });
      for (const item of batch) {
        const key = `${item.owner}/${item.repo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        aggregated.push(item);
        if (aggregated.length >= limit) break;
      }
    } catch (err) {
      console.warn(`[${agent}] search failed for "${q}":`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log(`[${agent}] searching yielded ${aggregated.length} unique repos`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of aggregated) {
    try {
      const result = await importRepo(agent, item, categoryId);
      if (result === "created") created++;
      else if (result === "updated") updated++;
      else skipped++;
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(`[${agent}] import ${item.owner}/${item.repo} failed:`, (err as Error).message);
    }
  }
  console.log(`[${agent}] created=${created} updated=${updated} skipped=${skipped}`);
}

async function main() {
  const agentArg = (process.argv[2] || "all") as AgentKey | "all";
  const limit = Number.parseInt(process.argv[3] || "50", 10);

  if (!process.env.GITHUB_TOKEN) {
    console.warn("WARNING: GITHUB_TOKEN not set — unauthenticated rate limit is 10/minute for search.");
  }

  const agents: AgentKey[] =
    agentArg === "all"
      ? (Object.keys(AGENT_SPECS) as AgentKey[])
      : [agentArg];

  for (const a of agents) {
    if (!AGENT_SPECS[a]) {
      console.error(`Unknown agent: ${a}`);
      continue;
    }
    await runForAgent(a, limit);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
