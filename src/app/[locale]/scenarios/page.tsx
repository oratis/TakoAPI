import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { SCENARIOS } from "@/lib/scenarios";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ScenarioPage" });
  const title = t("indexTitle");
  const description = t("indexDescription");
  return {
    metadataBase: new URL(absoluteUrl("")),
    title,
    description,
    alternates: localizedAlternates(locale, "/scenarios"),
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: absoluteUrl("/scenarios"),
      type: "website",
      locale: localeOg(locale),
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${title} — ${SITE_NAME}`, description },
  };
}

export default async function ScenariosIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ScenarioPage");
  const tScenario = await getTranslations("Scenarios");
  const tAgents = await getTranslations("Agents");

  const rows = await prisma.agent.findMany({ where: { status: "APPROVED" }, select: { scenarios: true } });
  const counts = new Map<string, number>();
  for (const r of rows) for (const s of r.scenarios) counts.set(s, (counts.get(s) ?? 0) + 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold">{t("indexHeroTitle")}</h1>
      <p className="text-gray-600 mt-2 mb-8 max-w-2xl">{t("indexHeroSubtitle")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {SCENARIOS.map((s) => (
          <Link
            key={s.slug}
            href={`/scenarios/${s.slug}`}
            className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-purple-200 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{s.emoji}</span>
              <span className="text-sm font-semibold text-gray-900 group-hover:text-purple-600">{tScenario(s.slug)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{tAgents("count", { count: counts.get(s.slug) ?? 0 })}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
