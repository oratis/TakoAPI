import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, SITE_NAME, SITE_URL, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Badge" });
  const title = t("pageTitle");
  const description = t("pageIntro");
  return {
    metadataBase: new URL(absoluteUrl("")),
    title,
    description,
    alternates: localizedAlternates(locale, "/badge"),
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: absoluteUrl("/badge"),
      type: "website",
      locale: localeOg(locale),
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${title} — ${SITE_NAME}`, description },
  };
}

export default async function BadgePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Badge");

  const example = await prisma.agent.findFirst({
    where: { status: "APPROVED", kind: "PROJECT", stars: { gt: 500 } },
    orderBy: { stars: "desc" },
    select: { slug: true },
  });
  const exSlug = example?.slug ?? "";
  const md = exSlug ? `[![TakoAPI](${SITE_URL}/api/badge/${exSlug})](${SITE_URL}/agents/${exSlug})` : "";

  const steps = [
    { n: 1, title: t("step1Title"), body: t("step1") },
    { n: 2, title: t("step2Title"), body: t("step2") },
    { n: 3, title: t("step3Title"), body: t("step3") },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold">{t("pageTitle")}</h1>
      <p className="text-gray-600 mt-3 max-w-2xl">{t("pageIntro")}</p>

      {exSlug && (
        <div className="mt-6 rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-2">{t("example")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${SITE_URL}/api/badge/${exSlug}`} alt="TakoAPI badge" className="h-5 mb-3" />
          <code className="block text-[11px] bg-gray-50 border border-gray-200 rounded px-3 py-2 break-all font-mono text-gray-600">
            {md}
          </code>
        </div>
      )}

      <ol className="mt-10 space-y-5">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-sm font-bold flex items-center justify-center">
              {s.n}
            </span>
            <div>
              <p className="font-medium text-gray-900">{s.title}</p>
              <p className="text-sm text-gray-500 mt-0.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <Link
          href="/agents"
          className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
        >
          {t("findListing")}
        </Link>
      </div>
    </div>
  );
}
