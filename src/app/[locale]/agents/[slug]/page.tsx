import { getTranslations, setRequestLocale } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { Star, GitFork } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { priceLabel } from "@/components/ui/AgentCard";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";
import { findScenario } from "@/lib/scenarios";
import { fetchReadme, fetchRepo, extractGithubOwnerRepo } from "@/lib/github";
import { gatewaySamples } from "@/lib/samples";
import { JsonLd } from "@/components/JsonLd";
import { AgentEngagement } from "@/components/AgentEngagement";
import { BadgeSnippet } from "@/components/BadgeSnippet";
import CodeTabs from "@/components/ui/CodeTabs";

export const dynamic = "force-dynamic";

/** Six hours. A page view must never cost a GitHub API call — see loadRepoDetails. */
const REPO_REVALIDATE_SECONDS = 21600;
const README_EXCERPT_CHARS = 600;

type RepoRef = { owner: string; repo: string };

type RepoDetails = {
  stars: number;
  language: string | null;
  license: string | null;
  pushedAt: string | null;
  topics: string[];
  readmeExcerpt: string | null;
};

/**
 * Which repo a PROJECT entry points at. The scraper fills repoOwner/repoName, but
 * hand-submitted entries only ever have the URL, so fall back to parsing it.
 */
function resolveRepoRef(agent: { kind: string; repoOwner: string | null; repoName: string | null; githubUrl: string | null }): RepoRef | null {
  if (agent.kind !== "PROJECT") return null;
  if (agent.repoOwner && agent.repoName) return { owner: agent.repoOwner, repo: agent.repoName };
  return agent.githubUrl ? extractGithubOwnerRepo(agent.githubUrl) : null;
}

/**
 * `fetchRepo` does not surface the licence, so ask the dedicated licence endpoint
 * rather than re-reading the whole repo payload. Runs inside the six-hour cache
 * below, so it costs one request per repo per revalidation.
 */
async function fetchRepoLicense(owner: string, repo: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/license`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  // 404 is the normal answer for a repo with no licence file.
  if (!res.ok) return null;
  const data = await res.json();
  const spdx = data?.license?.spdx_id;
  return typeof spdx === "string" && spdx !== "NOASSERTION" ? spdx : null;
}

/**
 * READMEs open with badge walls, HTML banners and code fences, none of which say
 * what the project does. Strip to plain prose so the excerpt starts at the first
 * real sentence, then cut on a word boundary.
 */
function readmeExcerpt(markdown: string): string | null {
  const plain = markdown
    // Only the top of the file can contribute to a 600-character excerpt, and
    // some READMEs are hundreds of kilobytes.
    .slice(0, 20000)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    // A fence left unterminated by the slice above would leak its code.
    .replace(/```[\s\S]*$/, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:-{3,}|={3,}|\*{3,})\s*$/gm, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\|.*$/gm, " ")
    .replace(/[*~]{1,3}/g, "")
    // Underscore emphasis only when it wraps a run, so snake_case identifiers
    // that survived the code-span strip keep their underscores.
    .replace(/(?<![A-Za-z0-9_])_{1,2}([^_\n]+?)_{1,2}(?![A-Za-z0-9_])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  // Below this, all that survived was a badge row — not worth a section.
  if (plain.length < 40) return null;
  if (plain.length <= README_EXCERPT_CHARS) return plain;
  const cut = plain.slice(0, README_EXCERPT_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > README_EXCERPT_CHARS - 200 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * GitHub metadata for a PROJECT entry, cached per owner/repo for six hours.
 *
 * The catalog holds thousands of scraped repos and the page is force-dynamic, so
 * fetching per view would burn the API budget (60/hour unauthenticated) and put
 * GitHub's latency in front of every render. Failures cache as null as well: the
 * alternative is retrying on every view during an outage, which is exactly when
 * the remaining budget matters most.
 */
const loadRepoDetails = unstable_cache(
  async (owner: string, repo: string): Promise<RepoDetails | null> => {
    try {
      const info = await fetchRepo(owner, repo);
      if (!info) return null;
      const [license, readme] = await Promise.all([
        fetchRepoLicense(owner, repo),
        fetchReadme(info.owner, info.repo, info.defaultBranch),
      ]);
      return {
        stars: info.stars,
        language: info.language,
        license,
        pushedAt: info.pushedAt,
        topics: info.topics.slice(0, 6),
        readmeExcerpt: readme ? readmeExcerpt(readme) : null,
      };
    } catch {
      // GitHub being unreachable must degrade the page, never fail it.
      return null;
    }
  },
  ["agent-repo-details"],
  { revalidate: REPO_REVALIDATE_SECONDS }
);

/** UTC to the minute — locale-independent, and stable between server and client. */
function utcMinute(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "AgentDetail" });
  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: {
      name: true,
      description: true,
      kind: true,
      githubUrl: true,
      repoOwner: true,
      repoName: true,
      _count: { select: { skills: true } },
    },
  });
  if (!agent) return { title: t("notFound") };
  const description = (agent.description || `${agent.name} on ${SITE_NAME}`).slice(0, 200);
  // Thin: a scraped PROJECT entry with no declared skills and a barely-there
  // description adds little unique value over the GitHub repo itself — keep it out
  // of the index to limit scaled-content exposure. Substantive entries stay indexed.
  let thin = agent.kind === "PROJECT" && agent._count.skills === 0 && (agent.description ?? "").trim().length < 80;
  if (thin) {
    // A README excerpt is the content the page was thin for lacking. It comes from
    // the same six-hour cache the render reads, so this costs no extra API call.
    const ref = resolveRepoRef(agent);
    const repo = ref ? await loadRepoDetails(ref.owner, ref.repo) : null;
    if (repo?.readmeExcerpt) thin = false;
  }
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: agent.name,
    description,
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    alternates: localizedAlternates(locale, `/agents/${slug}`),
    openGraph: { title: `${agent.name} — ${SITE_NAME}`, description, url: absoluteUrl(`/agents/${slug}`), type: "website", locale: localeOg(locale), images: [absoluteUrl("/opengraph-image")] },
    twitter: { card: "summary_large_image", title: `${agent.name} — ${SITE_NAME}`, description },
  };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AgentDetail");
  const tScenario = await getTranslations("Scenarios");
  const tComp = await getTranslations("Components");
  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    include: {
      category: { select: { name: true, slug: true } },
      skills: { orderBy: { name: "asc" } },
      publisher: { select: { name: true, username: true } },
    },
  });
  if (!agent) notFound();

  const isProject = agent.kind === "PROJECT";
  const publisherName = isProject
    ? agent.repoOwner || t("publisherOpenSource")
    : agent.publisher.username || agent.publisher.name || t("publisherUnknown");

  const repoRef = resolveRepoRef(agent);
  const repo = repoRef ? await loadRepoDetails(repoRef.owner, repoRef.repo) : null;
  // The live count beats the scraped one, which is only as fresh as the last run.
  const starCount = repo?.stars ?? agent.stars;

  const healthLabel = agent.healthStatus
    ? agent.healthStatus === "ok"
      ? t("healthOk")
      : agent.healthStatus === "degraded"
        ? t("healthDegraded")
        : t("healthDown")
    : null;

  const canonical = absoluteUrl(`/agents/${agent.slug}`);
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: agent.name,
    description: agent.description,
    url: canonical,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    ...(agent.githubUrl ? { codeRepository: agent.githubUrl } : {}),
    ...(agent.homepage ? { sameAs: [agent.homepage] } : {}),
    ...(agent.pricingModel === "FREE"
      ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }
      : {}),
    ...(agent.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: agent.avgRating.toFixed(2),
            ratingCount: agent.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("breadcrumbHome"), item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: t("breadcrumbMarketplace"), item: absoluteUrl("/agents") },
      { "@type": "ListItem", position: 3, name: agent.name, item: canonical },
    ],
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <JsonLd data={softwareLd} />
      <JsonLd data={breadcrumbLd} />
      <Link href="/agents" className="text-sm text-gray-500 hover:text-gray-700">
        {t("backToMarketplace")}
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {agent.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600 font-medium">
              {agent.category.name}
            </span>
          )}
          {isProject && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
              <GitFork className="h-3 w-3" /> {t("openSourceProject")}
            </span>
          )}
          {!isProject && healthLabel && (
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                agent.healthStatus === "ok"
                  ? "text-green-700 bg-green-50"
                  : agent.healthStatus === "degraded"
                    ? "text-amber-700 bg-amber-50"
                    : "text-red-700 bg-red-50"
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${agent.healthStatus === "ok" ? "bg-green-500" : agent.healthStatus === "degraded" ? "bg-amber-400" : "bg-red-500"}`} />
              {healthLabel}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{agent.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("by", { name: publisherName })}</p>
        <p className="text-base text-gray-600 mt-3 max-w-2xl">{agent.description}</p>
        {agent.scenarios.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="text-xs text-gray-500">{t("scenario")}</span>
            {agent.scenarios.map((slug) => {
              const sc = findScenario(slug);
              if (!sc) return null;
              return (
                <Link
                  key={slug}
                  href={`/agents?scenario=${slug}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600 hover:bg-purple-100"
                >
                  <span>{sc.emoji}</span>
                  {tScenario(slug)}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Engagement: community rating, your rating, bookmark */}
      <div className="mb-8">
        <AgentEngagement slug={agent.slug} />
      </div>

      {/* Project row. Hosted agents get their facts from the "at a glance" panel
          instead — repeating them as chips here only doubled the reading. */}
      {isProject && (
        <div className="flex flex-wrap gap-2 mb-8">
          {typeof starCount === "number" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {t("stars", { count: starCount })}
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
            {t("selfHost")}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Call examples. First thing in the main column: the page exists so a
              developer can decide whether to call this agent, and this is the answer. */}
          {!isProject && (
            <section>
              <h2 className="text-lg font-semibold mb-2">{t("callThroughTakoApi")}</h2>
              <p className="text-sm text-gray-600 mb-3">
                {t.rich("gatewayHint", {
                  link: (chunks) => (
                    <Link href="/dashboard" className="text-purple-600 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
              <CodeTabs samples={gatewaySamples(agent.slug)} ariaLabel={t("callExamplesLabel")} />
            </section>
          )}

          {isProject && repo?.readmeExcerpt && (
            <section>
              <h2 className="text-lg font-semibold mb-2">{t("readmeHeading")}</h2>
              <p className="text-sm text-gray-600">{repo.readmeExcerpt}</p>
              <p className="text-xs text-gray-500 mt-2">{t("readmeNote")}</p>
            </section>
          )}

          {/* Skills */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              {t("skills")} {agent.skills.length > 0 && <span className="text-gray-500 font-normal">{t("skillsCount", { count: agent.skills.length })}</span>}
            </h2>
            {agent.skills.length === 0 ? (
              <p className="text-sm text-gray-500">
                {isProject ? t("noSkillsProject") : t("noSkillsHosted")}
              </p>
            ) : (
              <div className="space-y-3">
                {agent.skills.map((s) => (
                  <div key={s.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                      <code className="text-[11px] text-gray-500">{s.skillKey}</code>
                    </div>
                    {s.description && <p className="text-sm text-gray-600 mt-1">{s.description}</p>}
                    {(s.inputModes.length > 0 || s.outputModes.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] text-gray-500">
                        {s.inputModes.map((m) => (
                          <span key={`in-${m}`} className="px-1.5 py-0.5 rounded bg-gray-100">{t("inputMode", { mode: m })}</span>
                        ))}
                        {s.outputModes.map((m) => (
                          <span key={`out-${m}`} className="px-1.5 py-0.5 rounded bg-gray-100">{t("outputMode", { mode: m })}</span>
                        ))}
                      </div>
                    )}
                    {s.examples.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {s.examples.slice(0, 3).map((ex, i) => (
                          <li key={i} className="text-xs text-gray-500 italic">“{ex}”</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Side panel */}
        <aside className="space-y-4">
          {isProject ? (
            <div className="rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold mb-3">{t("repository")}</h2>
              {/* Star count is not repeated here — the chip above already carries it. */}
              {repo && (
                <dl className="space-y-2 text-xs mb-3">
                  {repo.language && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-gray-500">{t("language")}</dt>
                      <dd className="text-gray-900 font-medium text-end">{repo.language}</dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">{t("license")}</dt>
                    <dd className="text-gray-900 font-medium text-end">{repo.license ?? t("licenseNone")}</dd>
                  </div>
                  {repo.pushedAt && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-gray-500">{t("lastPush")}</dt>
                      <dd className="text-gray-900 font-medium text-end">{utcDay(repo.pushedAt)}</dd>
                    </div>
                  )}
                  {repo.topics.length > 0 && (
                    <div>
                      <dt className="text-gray-500 mb-1">{t("topics")}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {repo.topics.map((topic) => (
                          <span key={topic} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{topic}</span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <p className="text-xs text-gray-500 mb-3">
                {t("openSourceProjectNote")}
              </p>
              {agent.githubUrl && (
                <a
                  href={agent.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm bg-gray-900 text-white rounded-lg px-3 py-2 hover:bg-gray-800"
                >
                  <GitFork className="h-4 w-4" /> {t("viewOnGithub")}
                </a>
              )}
              {agent.homepage && (
                <p className="mt-3 text-xs">
                  <a href={agent.homepage} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                    {agent.homepage.replace(/^https?:\/\//, "")}
                  </a>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold mb-3">{t("atAGlance")}</h2>
              <dl className="space-y-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("protocols")}</dt>
                  <dd className="text-gray-900 font-medium text-end">
                    {agent.protocols.length > 0
                      ? agent.protocols.map((p) => (p === "OPENAI_COMPAT" ? "OpenAI-compatible" : p)).join(" · ")
                      : t("protocolsNone")}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("streaming")}</dt>
                  <dd className="text-gray-900 font-medium text-end">{agent.streaming ? t("yes") : t("no")}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("pushNotifications")}</dt>
                  <dd className="text-gray-900 font-medium text-end">{agent.pushNotify ? t("yes") : t("no")}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("pricing")}</dt>
                  <dd className="text-gray-900 font-medium text-end">{priceLabel(agent.pricingModel, agent.unitPriceUsd, tComp)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("health")}</dt>
                  <dd className="text-gray-900 font-medium text-end">
                    {healthLabel ?? t("healthUnknown")}
                    {/* Visible, not a title tooltip: "responding" is worthless
                        without knowing how long ago, and tooltips do not open on touch. */}
                    {agent.healthCheckedAt && (
                      <span className="block font-normal text-gray-500">
                        {t("healthCheckedAt", { time: utcMinute(agent.healthCheckedAt) })}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("totalCalls")}</dt>
                  <dd className="text-gray-900 font-medium text-end">{t("numberValue", { count: agent.callsCount })}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">{t("averageRating")}</dt>
                  <dd className="text-gray-900 font-medium text-end">
                    {agent.ratingCount > 0
                      ? t("ratingValue", { rating: agent.avgRating.toFixed(1), count: agent.ratingCount })
                      : t("notRated")}
                  </dd>
                </div>
              </dl>

              {(agent.endpointUrl || agent.cardUrl || agent.homepage) && (
                <dl className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs">
                  {agent.endpointUrl && (
                    <div>
                      <dt className="text-gray-500">{t("endpoint")}</dt>
                      <dd className="text-gray-700 break-all">{agent.endpointUrl}</dd>
                    </div>
                  )}
                  {agent.cardUrl && (
                    <div>
                      <dt className="text-gray-500">{t("agentCard")}</dt>
                      <dd>
                        <a href={agent.cardUrl} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                          {agent.cardUrl.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                  {agent.homepage && (
                    <div>
                      <dt className="text-gray-500">{t("homepage")}</dt>
                      <dd>
                        <a href={agent.homepage} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                          {agent.homepage.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}
          <BadgeSnippet slug={agent.slug} />
        </aside>
      </div>
    </div>
  );
}
