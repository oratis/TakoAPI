import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Bot, Boxes, Blocks, Sparkles } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl, localizedAlternates, localizedUrl } from "@/lib/seo";
import { localeOg } from "@/lib/locales";
import InstallTabs from "@/components/ui/InstallTabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Install" });
  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL(absoluteUrl("")),
    title: t("metaTitle"),
    description,
    alternates: localizedAlternates(locale, "/install"),
    openGraph: {
      type: "website",
      locale: localeOg(locale),
      url: localizedUrl(locale, "/install"),
      siteName: "TakoAPI",
      title,
      description,
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title, description, images: [absoluteUrl("/opengraph-image")] },
  };
}

export default async function InstallPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Install");

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t("title"),
    description: t("description"),
    totalTime: "PT1M",
    step: [
      {
        "@type": "HowToStep",
        name: t("stepRunInstallerName"),
        text: t("stepRunInstallerText"),
        url: absoluteUrl("/install"),
      },
      {
        "@type": "HowToStep",
        name: t("stepUseAgentName"),
        text: t("stepUseAgentText"),
        url: absoluteUrl("/install"),
      },
    ],
  };

  return (
    <div>
      <JsonLd data={howToLd} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-purple-50 via-white to-blue-50 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-medium mb-4">
            <Sparkles className="h-3.5 w-3.5" /> {t("heroBadge")}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            {t.rich("heroTitle", {
              grad: (chunks) => (
                <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                  {chunks}
                </span>
              ),
            })}
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {t("heroSubtitle")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5"><Bot className="h-4 w-4 text-purple-600" /> Claude Code</span>
            <span className="inline-flex items-center gap-1.5"><Boxes className="h-4 w-4 text-purple-600" /> Codex</span>
            <span className="inline-flex items-center gap-1.5"><Blocks className="h-4 w-4 text-purple-600" /> OpenCode</span>
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <InstallTabs />
      </section>

      {/* What gets installed */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-6 sm:p-8">
          <h2 className="text-lg font-semibold mb-3">{t("whatTitle")}</h2>
          <ul className="space-y-2 text-sm text-gray-600 list-disc ps-5">
            <li>
              {t("whatWritesSkill")}
            </li>
            <li>
              {t.rich("whatTeachesAgent", {
                link: (chunks) => (
                  <Link href="/api/registry" className="text-purple-600 hover:text-purple-700">
                    {chunks}
                  </Link>
                ),
              })}
            </li>
            <li>
              {t.rich("whatMcpServer", {
                b: (chunks) => <strong>{chunks}</strong>,
                cmd: (chunks) => (
                  <code className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                    {chunks}
                  </code>
                ),
                tool: (chunks) => <code className="text-xs font-mono">{chunks}</code>,
              })}
            </li>
            <li>
              {t.rich("whatIdempotent", {
                cmd: (chunks) => (
                  <code className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                    {chunks}
                  </code>
                ),
              })}
            </li>
            <li>
              {t.rich("whatApiKey", {
                link: (chunks) => (
                  <Link href="/dashboard" className="text-purple-600 hover:text-purple-700">
                    {chunks}
                  </Link>
                ),
                cmd: (chunks) => (
                  <code className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                    {chunks}
                  </code>
                ),
              })}
            </li>
          </ul>
          <p className="mt-4 text-xs text-gray-400">
            {t.rich("footnote", {
              cmd: (chunks) => (
                <code className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">{chunks}</code>
              ),
              link: (chunks) => (
                <a href="/install.sh" className="text-purple-600 hover:text-purple-700">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </section>
    </div>
  );
}
