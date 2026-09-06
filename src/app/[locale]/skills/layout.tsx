import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SITE_NAME, localizedAlternates, localizedUrl, absoluteUrl } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

// Base metadata for the whole /skills subtree: the unfiltered listing's title,
// description, canonical and OG card. The listing page overrides the title and
// adds robots/canonical for searched, filtered and paginated views (only a page
// receives `searchParams`, never a layout); the detail page overrides it per skill.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Skills" });

  return {
    metadataBase: new URL(absoluteUrl("")),
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localizedAlternates(locale, "/skills"),
    openGraph: {
      title: t("ogTitle", { siteName: SITE_NAME }),
      description: t("ogDescription"),
      url: localizedUrl(locale, "/skills"),
      siteName: SITE_NAME,
      locale: localeOg(locale),
      type: "website",
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
