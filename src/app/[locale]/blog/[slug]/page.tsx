import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/JsonLd";
import { getPost } from "@/lib/blog";
import { absoluteUrl, SITE_NAME, SITE_URL, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";
import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  const isDefault = locale === routing.defaultLocale;
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: localizedAlternates(locale, `/blog/${slug}`),
    // English is the canonical, indexable version; other locales render the same
    // English body and are noindexed to avoid near-duplicate penalties.
    ...(isDefault ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${post.title} — ${SITE_NAME}`,
      description: post.description,
      url: absoluteUrl(`/blog/${slug}`),
      type: "article",
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      locale: localeOg(locale),
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${post.title} — ${SITE_NAME}`, description: post.description },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = getPost(slug);
  if (!post) notFound();

  const t = await getTranslations("Blog");
  const canonical = absoluteUrl(`/blog/${slug}`);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    url: canonical,
    mainEntityOfPage: canonical,
    image: absoluteUrl("/opengraph-image"),
    keywords: post.tags.join(", "),
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") },
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: t("title"), item: absoluteUrl("/blog") },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  };
  const faqLd = post.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />
      {faqLd && <JsonLd data={faqLd} />}

      <Link href="/blog" className="text-sm text-gray-500 hover:text-gray-700">
        {t("backToBlog")}
      </Link>

      <header className="mt-4 mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
          <span className="text-xs text-gray-400">· {t("minRead", { min: post.readingMinutes })}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{post.title}</h1>
        <p className="text-lg text-gray-600 mt-4">{post.description}</p>
        <p className="text-xs text-gray-400 mt-3">
          {t("published")} <time dateTime={post.datePublished}>{post.datePublished}</time>
        </p>
      </header>

      <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.body }} />

      {post.faq?.length ? (
        <section className="mt-12 border-t border-gray-200 pt-8">
          <h2 className="text-2xl font-bold mb-4">{t("faqTitle")}</h2>
          <dl className="space-y-5">
            {post.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-gray-900">{f.q}</dt>
                <dd className="text-gray-600 mt-1">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-gray-200 pt-6">
        <Link href="/blog" className="text-sm font-medium text-purple-600 hover:text-purple-800">
          {t("backToBlog")}
        </Link>
      </footer>
    </article>
  );
}
