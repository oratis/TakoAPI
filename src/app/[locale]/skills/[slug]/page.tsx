import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Download, ExternalLink, Eye, Star, Terminal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, localizedAlternates, SITE_NAME } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { SkillEngagement } from "@/components/SkillEngagement";
import { SkillLikeButton } from "@/components/skill/SkillLikeButton";
import { SkillReadme } from "@/components/skill/SkillReadme";
import { SkillViewPing } from "@/components/skill/SkillViewPing";
import CodeTabs, { type CodeSample } from "@/components/ui/CodeTabs";

// The page reads the session (to honour the owner/admin rule for non-approved
// skills and to seed the like button), so it is per-request by definition.
export const dynamic = "force-dynamic";

// One row for both generateMetadata and the render — React's cache() collapses
// them into a single query per request. The select is explicit because
// `reviewNote` is an internal moderation note and must never reach the page.
const getSkill = cache((slugOrId: string) =>
  prisma.skill.findFirst({
    where: { OR: [{ id: slugOrId }, { slug: slugOrId }] },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      brief: true,
      readme: true,
      author: true,
      githubUrl: true,
      clawHubUrl: true,
      clawSkillsUrl: true,
      installCmd: true,
      downloads: true,
      stars: true,
      viewsCount: true,
      likesCount: true,
      status: true,
      submitterId: true,
      category: { select: { name: true } },
    },
  })
);

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toString();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "SkillDetail" });
  const skill = await getSkill(slug);
  // The intermediate skills/layout.tsx sets a plain title, which breaks the root
  // template for this nested segment — hence the explicit brand suffix.
  if (!skill) return { title: { absolute: `${t("notFoundMetaTitle")} — ${SITE_NAME}` } };

  const url = absoluteUrl(`/skills/${skill.slug}`);
  // Title/description stay DB-driven: skill content is not translated UI chrome.
  const description = (skill.brief || skill.description || `${skill.name} — ${SITE_NAME}`).slice(0, 200);
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: { absolute: `${skill.name} — ${SITE_NAME}` },
    description,
    alternates: localizedAlternates(locale, `/skills/${skill.slug}`),
    // A skill that is not APPROVED is reachable only by its submitter or an
    // admin, so it has no business in a search index.
    ...(skill.status === "APPROVED" ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title: `${skill.name} — ${SITE_NAME}`,
      description,
      url,
      type: "article",
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${skill.name} — ${SITE_NAME}`, description },
  };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("SkillDetail");

  const skill = await getSkill(slug);
  if (!skill) notFound();

  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  // Same visibility rule as GET /api/skills/[id]: a skill that is not APPROVED is
  // visible to its submitter and to admins, and does not exist for anyone else.
  if (skill.status !== "APPROVED") {
    const isOwner = !!user?.id && user.id === skill.submitterId;
    if (!isOwner && user?.role !== "admin") notFound();
  }

  // Seed the like button with the visitor's real state; without this it renders
  // "not liked" for someone who already liked the skill, and their next click
  // removes the like they cannot see.
  const liked = user?.id
    ? (await prisma.like.findUnique({
        where: { userId_skillId: { userId: user.id, skillId: skill.id } },
        select: { id: true },
      })) !== null
    : false;

  // installCmd is null for skills that were scraped from GitHub and never
  // published to ClawHub — `clawhub install <slug>` would fail for them, so the
  // CLI sample only appears when the registry actually has the skill.
  const repoUrl = skill.githubUrl || skill.clawHubUrl || skill.clawSkillsUrl;
  const installSamples: CodeSample[] = [
    ...(skill.installCmd ? [{ key: "cli", label: t("clawHubCli"), code: skill.installCmd }] : []),
    ...(repoUrl ? [{ key: "agent", label: t("codingAgent"), code: t("agentPrompt", { url: repoUrl }) }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: skill.name,
          description: skill.brief || skill.description,
          url: absoluteUrl(`/skills/${skill.slug}`),
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          ...(skill.author ? { author: { "@type": "Person", name: skill.author } } : {}),
          ...(skill.githubUrl ? { codeRepository: skill.githubUrl } : {}),
        }}
      />
      <SkillViewPing idOrSlug={skill.slug} />

      <Link
        href="/skills"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("backToSkills")}
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{skill.name}</h1>
              {skill.author && <p className="text-sm text-gray-500 mt-1">{t("by", { author: skill.author })}</p>}
              <span className="inline-flex items-center mt-3 px-3 py-1 rounded-full text-xs bg-purple-50 text-purple-700 font-medium">
                {skill.category.name}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-end">
              {skill.downloads > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Download className="h-4 w-4" aria-hidden />
                  {formatNumber(skill.downloads)}
                  {/* Named for what it is: a third-party count scraped from
                      clawskills.sh, not installs through TakoAPI. */}
                  <span className="sr-only">{t("downloadsSource")}</span>
                </div>
              )}
              {skill.stars > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Star className="h-4 w-4" aria-hidden />
                  {formatNumber(skill.stars)}
                  <span className="sr-only">{t("stars")}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Eye className="h-4 w-4" aria-hidden />
                {formatNumber(skill.viewsCount)}
                <span className="sr-only">{t("views")}</span>
              </div>
              <SkillLikeButton
                idOrSlug={skill.slug}
                initialLiked={liked}
                initialCount={skill.likesCount}
                signedIn={!!user?.id}
              />
            </div>
          </div>
        </div>

        {/* Community rating, your rating, bookmark. Per-visitor, so it stays client-side. */}
        <div className="px-6 sm:px-8 py-4 border-b border-gray-100">
          <SkillEngagement idOrSlug={skill.slug} />
        </div>

        <section className="p-6 sm:p-8 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">{t("brief")}</h2>
          <p className="text-gray-600 leading-relaxed">{skill.brief || skill.description}</p>
        </section>

        <SkillReadme readme={skill.readme} />

        <section className="p-6 sm:p-8 border-b border-gray-100 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">{t("installation")}</h2>
          {installSamples.length > 0 ? (
            <>
              <CodeTabs samples={installSamples} ariaLabel={t("installation")} />
              <p className="text-sm text-gray-600">
                {skill.installCmd ? t("installHintRegistry") : t("installHintRepo")}
              </p>
              {/* Only for the GitHub-scraped skills: the prompt tells the agent
                  where to look, this lets the reader check the source first. */}
              {!skill.installCmd && skill.githubUrl && (
                <a
                  href={skill.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  {t("openRepository")}
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-600">{t("installUnavailable")}</p>
          )}
        </section>

        <section className="p-6 sm:p-8 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">{t("links")}</h2>
          <div className="flex flex-wrap gap-3">
            {skill.githubUrl && (
              <a
                href={skill.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("github")}
              </a>
            )}
            {(skill.clawHubUrl || skill.clawSkillsUrl) && (
              <a
                href={skill.clawHubUrl || skill.clawSkillsUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Terminal className="h-4 w-4" aria-hidden />
                {t("clawHub")}
                <ExternalLink className="h-3 w-3 text-gray-500" aria-hidden />
              </a>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
