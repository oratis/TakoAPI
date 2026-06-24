import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { Zap, Bell, ShieldCheck, BadgeCheck, Star, GitFork } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { priceLabel } from "@/components/ui/AgentCard";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";
import { findScenario } from "@/lib/scenarios";
import { JsonLd } from "@/components/JsonLd";
import { AgentEngagement } from "@/components/AgentEngagement";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "AgentDetail" });
  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: { name: true, description: true },
  });
  if (!agent) return { title: t("notFound") };
  const description = (agent.description || `${agent.name} on ${SITE_NAME}`).slice(0, 200);
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: agent.name,
    description,
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
          {!isProject && agent.cardSignatureVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <BadgeCheck className="h-3 w-3" /> {t("signedCard")}
            </span>
          )}
          {!isProject && agent.namespaceVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <ShieldCheck className="h-3 w-3" /> {t("verifiedPublisher")}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{agent.name}</h1>
        <p className="text-sm text-gray-400 mt-1">{t("by", { name: publisherName })}</p>
        <p className="text-base text-gray-600 mt-3 max-w-2xl">{agent.description}</p>
        {agent.scenarios.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="text-xs text-gray-400">{t("scenario")}</span>
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

      {/* Capability / project row */}
      {isProject ? (
        <div className="flex flex-wrap gap-2 mb-8">
          {typeof agent.stars === "number" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {t("stars", { count: agent.stars })}
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
            {t("selfHost")}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-8">
          {agent.protocols.map((p) => (
            <span key={p} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
              {p === "OPENAI_COMPAT" ? "OpenAI-compatible" : p}
            </span>
          ))}
          {agent.streaming && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
              <Zap className="h-3 w-3" /> {t("streaming")}
            </span>
          )}
          {agent.pushNotify && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-50 text-sky-700">
              <Bell className="h-3 w-3" /> {t("pushNotifications")}
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-600 text-white">
            {priceLabel(agent.pricingModel, agent.unitPriceUsd, tComp)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Skills */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">
            {t("skills")} {agent.skills.length > 0 && <span className="text-gray-400 font-normal">{t("skillsCount", { count: agent.skills.length })}</span>}
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
                    <code className="text-[11px] text-gray-400">{s.skillKey}</code>
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
        </div>

        {/* Side panel */}
        <aside className="space-y-4">
          {isProject ? (
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-2">{t("openSourceProjectHeading")}</h3>
              <p className="text-xs text-gray-400 mb-3">
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
            <>
              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-3">{t("integration")}</h3>
                <dl className="space-y-2 text-xs">
                  {agent.endpointUrl && (
                    <div>
                      <dt className="text-gray-400">{t("endpoint")}</dt>
                      <dd className="text-gray-700 break-all">{agent.endpointUrl}</dd>
                    </div>
                  )}
                  {agent.cardUrl && (
                    <div>
                      <dt className="text-gray-400">{t("agentCard")}</dt>
                      <dd>
                        <a href={agent.cardUrl} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                          {agent.cardUrl.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                  {agent.homepage && (
                    <div>
                      <dt className="text-gray-400">{t("homepage")}</dt>
                      <dd>
                        <a href={agent.homepage} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                          {agent.homepage.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-xl border border-dashed border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-2">{t("callThroughTakoApi")}</h3>
                <p className="text-xs text-gray-400 mb-2">{t("gatewayPhase2")}</p>
                <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">
{`curl https://takoapi.com/v1/agents/${agent.slug}/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"text": "..."}'`}
                </pre>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
