import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/JsonLd";
import { getAllPosts } from "@/lib/blog";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";
import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Blog" });
  const title = t("title");
  const description = t("subtitle");
  // English is the canonical, indexable content; non-English locales render the
  // same English body and are marked noindex to avoid near-duplicate penalties
  // (same defense the entity pages use).
  const isDefault = locale === routing.defaultLocale;
  return {
    metadataBase: new URL(absoluteUrl("")),
    title,
    description,
    alternates: localizedAlternates(locale, "/blog"),
    ...(isDefault ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: absoluteUrl("/blog"),
      type: "website",
      locale: localeOg(locale),
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${title} — ${SITE_NAME}`, description },
  };
}

export default async function BlogIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Blog");
  const posts = getAllPosts();

  const listLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE_NAME} — ${t("title")}`,
    description: t("subtitle"),
    url: absoluteUrl("/blog"),
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.datePublished,
      dateModified: p.dateModified,
      url: absoluteUrl(`/blog/${p.slug}`),
    })),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd data={listLd} />
      <header className="mb-10">
        <h1 className="text-4xl font-bold">{t("title")}</h1>
        <p className="text-gray-600 mt-3 max-w-2xl">{t("subtitle")}</p>
      </header>

      <div className="space-y-6">
        {posts.map((p) => (
          <article
            key={p.slug}
            className="group rounded-xl border border-gray-200 p-6 hover:border-purple-300 hover:shadow-sm transition"
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {p.tags.map((tag) => (
                <span key={tag} className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              <span className="text-xs text-gray-400">· {t("minRead", { min: p.readingMinutes })}</span>
            </div>
            <h2 className="text-xl font-semibold group-hover:text-purple-700">
              <Link href={`/blog/${p.slug}`}>{p.title}</Link>
            </h2>
            <p className="text-gray-600 mt-2">{p.description}</p>
            <Link
              href={`/blog/${p.slug}`}
              className="inline-block mt-3 text-sm font-medium text-purple-600 hover:text-purple-800"
            >
              {t("readMore")} →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
