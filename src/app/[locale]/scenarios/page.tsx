import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getScenarioCounts } from "@/lib/catalog";
import { SCENARIOS } from "@/lib/scenarios";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

// The only read on this page is the tagged catalog cache in lib/catalog, so the
// per-request render costs nothing at the database and a revalidated count shows
// up on the next visit rather than at the end of a route-cache window.
export const dynamic = "force-dynamic";

// A scenario below this many approved agents is "sparse": its landing page is
// thin enough that the detail page serves it `noindex`, so listing it here as an
// equal peer of the 1,000-agent scenarios oversells it. Keep this in step with
// MIN_INDEXABLE_AGENTS in ./[slug]/page.tsx — the two describe the same line.
const WELL_POPULATED_MIN = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
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

function ScenarioTile({
  href,
  emoji,
  label,
  countLabel,
  sharePercent,
}: {
  href: string;
  emoji: string;
  label: string;
  countLabel: string;
  /** Size relative to the largest scenario, 0–100. Omitted on the sparse tiles. */
  sharePercent?: number;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-gray-200 bg-white p-4 hover:border-purple-300 hover:shadow-sm transition"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-xl">
          {emoji}
        </span>
        <span className="text-sm font-semibold text-gray-900 group-hover:text-purple-600">{label}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1.5">{countLabel}</p>
      {sharePercent !== undefined && (
        // "366 agents" says nothing about whether this is a big scenario or a
        // small one. The bar puts each against the largest, which is the whole
        // question the index has to answer. Decorative: the count above it is
        // the accessible version.
        <div aria-hidden="true" className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-purple-500" style={{ width: `${sharePercent}%` }} />
        </div>
      )}
    </Link>
  );
}

export default async function ScenariosIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ScenarioPage");
  const tScenario = await getTranslations("Scenarios");
  const tAgents = await getTranslations("Agents");

  const counts = await getScenarioCounts();

  // Ordered by size rather than by taxonomy order: the 1,100-agent scenario and
  // the 4-agent one were indistinguishable in the old grid. `sort` is stable, so
  // scenarios on the same count keep the taxonomy's own ordering.
  const ranked = SCENARIOS.map((scenario) => ({ scenario, count: counts[scenario.slug] ?? 0 })).sort(
    (a, b) => b.count - a.count
  );
  const populated = ranked.filter((r) => r.count >= WELL_POPULATED_MIN);
  const sparse = ranked.filter((r) => r.count < WELL_POPULATED_MIN);
  const largest = ranked[0]?.count ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold">{t("indexHeroTitle")}</h1>
      <p className="text-gray-600 mt-2 max-w-2xl">{t("indexHeroSubtitle")}</p>

      {populated.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">{t("indexPopularHeading")}</h2>
          <p className="text-sm text-gray-600 mt-1 mb-4 max-w-2xl">{t("indexPopularHint")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {populated.map(({ scenario, count }) => (
              <ScenarioTile
                key={scenario.slug}
                href={`/scenarios/${scenario.slug}`}
                emoji={scenario.emoji}
                label={tScenario(scenario.slug)}
                countLabel={tAgents("count", { count })}
                // `largest` is this list's own head, so it is never 0 here.
                sharePercent={Math.max(3, Math.round((count / largest) * 100))}
              />
            ))}
          </div>
        </section>
      )}

      {sparse.length > 0 && (
        <section className="mt-12 border-t border-gray-200 pt-8">
          <h2 className="text-lg font-semibold text-gray-900">{t("indexSparseHeading")}</h2>
          <p className="text-sm text-gray-600 mt-1 mb-4 max-w-2xl">{t("indexSparseHint")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sparse.map(({ scenario, count }) => (
              <ScenarioTile
                key={scenario.slug}
                href={`/scenarios/${scenario.slug}`}
                emoji={scenario.emoji}
                label={tScenario(scenario.slug)}
                countLabel={tAgents("count", { count })}
              />
            ))}
          </div>
          <Link
            href="/submit-agent"
            className="mt-5 inline-flex text-sm font-medium text-purple-600 hover:underline"
          >
            {t("indexSparseCta")}
          </Link>
        </section>
      )}
    </div>
  );
}
