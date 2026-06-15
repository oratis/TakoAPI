import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SITE_NAME, localizedAlternates, localizedUrl, absoluteUrl } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

// The skills pages are client components and can't export metadata themselves,
// so this server layout supplies it. Detail pages override via [slug]/layout.tsx.
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
