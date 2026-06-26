import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import AgentCard from "@/components/ui/AgentCard";
import { JsonLd } from "@/components/JsonLd";
import { findScenario } from "@/lib/scenarios";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const sc = findScenario(slug);
  if (!sc) return {};
  const tScenario = await getTranslations({ locale, namespace: "Scenarios" });
  const t = await getTranslations({ locale, namespace: "ScenarioPage" });
  const label = tScenario(slug);
  const title = t("metaTitle", { scenario: label });
  const description = t("metaDescription", { scenario: label });
  return {
    metadataBase: new URL(absoluteUrl("")),
    title,
    description,
    alternates: localizedAlternates(locale, `/scenarios/${slug}`),
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/scenarios/${slug}`),
      type: "website",
      locale: localeOg(locale),
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${title} — ${SITE_NAME}`, description },
  };
}

export default async function ScenarioLandingPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sc = findScenario(slug);
  if (!sc) notFound();

  const t = await getTranslations("ScenarioPage");
  const tScenario = await getTranslations("Scenarios");
  const tAgents = await getTranslations("Agents");
  const tDetail = await getTranslations("AgentDetail");
  const label = tScenario(slug);

  const agents = await prisma.agent.findMany({
    where: { status: "APPROVED", scenarios: { has: slug } },
    include: {
      category: { select: { name: true, slug: true } },
      _count: { select: { skills: true } },
    },
    orderBy: [{ featured: "desc" }, { callsCount: "desc" }, { stars: "desc" }],
    take: 60,
  });

  const canonical = absoluteUrl(`/scenarios/${slug}`);
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("metaTitle", { scenario: label }),
    description: t("metaDescription", { scenario: label }),
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: agents.length,
      itemListElement: agents.slice(0, 30).map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/agents/${a.slug}`),
        name: a.name,
      })),
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tDetail("breadcrumbHome"), item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: t("breadcrumbScenarios"), item: absoluteUrl("/scenarios") },
      { "@type": "ListItem", position: 3, name: label, item: canonical },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <JsonLd data={collectionLd} />
      <JsonLd data={breadcrumbLd} />
      <Link href="/scenarios" className="text-sm text-gray-500 hover:text-gray-700">
        {t("back")}
      </Link>
      <div className="mt-3 mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <span>{sc.emoji}</span>
          {t("metaTitle", { scenario: label })}
        </h1>
        <p className="text-gray-600 mt-2 max-w-2xl">{t("heroSubtitle", { scenario: label })}</p>
        <p className="text-sm text-gray-400 mt-2">{tAgents("count", { count: agents.length })}</p>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <p className="text-gray-500">{t("empty")}</p>
          <Link href="/agents" className="text-purple-600 text-sm mt-1 inline-block">
            {t("browseAll")} →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}
