import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SITE_URL, SITE_NAME, SITE_KEYWORDS, localizedAlternates, localizedUrl } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { localeDir, localeOg } from "@/lib/locales";
import "../globals.css";
import Providers from "../providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"] });

/** Pre-render all locale variants. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const tagline = t("tagline");
  const description = t("description");

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE_NAME} — ${tagline}`,
      template: `%s — ${SITE_NAME}`,
    },
    description,
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    alternates: localizedAlternates(locale, ""),
    openGraph: {
      type: "website",
      locale: localeOg(locale),
      url: localizedUrl(locale, ""),
      siteName: SITE_NAME,
      title: `${SITE_NAME} — ${tagline}`,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE_NAME} — ${tagline}`,
      description,
      images: [`${SITE_URL}/twitter-image`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    // Search Console domain verification (GTM §0). Set GOOGLE_SITE_VERIFICATION
    // to the token from the GSC "HTML tag" method and redeploy — Next renders
    // <meta name="google-site-verification">. Omitted entirely when unset, and
    // only meaningful on the canonical English pages (others are noindexed),
    // but harmless to emit everywhere. Supports a comma-separated list.
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? {
          verification: {
            google: process.env.GOOGLE_SITE_VERIFICATION.split(",").map((s) => s.trim()),
          },
        }
      : {}),
    category: "technology",
  };
}

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // The `[locale]` segment is effectively a catch-all, so reject unknown values.
  if (!hasLocale(routing.locales, locale)) notFound();
  // Opt static rendering into the active locale (safe on dynamic children too).
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={localeDir(locale)} className="h-full">
      <body className={`${inter.className} min-h-full flex flex-col bg-white text-gray-900`}>
        {/* No props: the server provider auto-inherits locale + messages from
            the request config, shipping only the active locale to the client. */}
        <NextIntlClientProvider>
          <Providers>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
