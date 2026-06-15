import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SITE_NAME, localizedAlternates, absoluteUrl } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Trending" });
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localizedAlternates(locale, "/trending"),
    openGraph: {
      title: t("ogTitle", { siteName: SITE_NAME }),
      description: t("ogDescription"),
      url: localizedAlternates(locale, "/trending").canonical,
      type: "website",
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

export default function TrendingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
