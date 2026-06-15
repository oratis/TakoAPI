import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, localizedAlternates, SITE_NAME } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

// The detail page is a client component (fetches via /api/skills/:slug), so this
// server layout provides its metadata + structured data for crawlers.
export const dynamic = "force-dynamic";

const getSkill = cache((slug: string) =>
  prisma.skill.findFirst({
    where: { slug },
    select: { name: true, description: true, brief: true, author: true, githubUrl: true },
  })
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "SkillDetail" });
  const skill = await getSkill(slug);
  // Intermediate skills/layout.tsx breaks root-template inheritance for this
  // nested segment, so set the brand suffix explicitly via title.absolute.
  if (!skill) return { title: { absolute: `${t("notFoundMetaTitle")} — ${SITE_NAME}` } };
  const url = absoluteUrl(`/skills/${slug}`);
  // Title/description stay DB-driven (skill content is not translated UI chrome).
  const description = (skill.brief || skill.description || `${skill.name} on ${SITE_NAME}`).slice(0, 200);
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: { absolute: `${skill.name} — ${SITE_NAME}` },
    description,
    alternates: localizedAlternates(locale, `/skills/${slug}`),
    openGraph: { title: `${skill.name} — ${SITE_NAME}`, description, url, type: "article", images: [absoluteUrl("/opengraph-image")] },
    twitter: { card: "summary_large_image", title: `${skill.name} — ${SITE_NAME}`, description },
  };
}

export default async function SkillDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const skill = await getSkill(slug);
  return (
    <>
      {skill && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: skill.name,
            description: skill.brief || skill.description,
            url: absoluteUrl(`/skills/${slug}`),
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Any",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            ...(skill.author ? { author: { "@type": "Person", name: skill.author } } : {}),
            ...(skill.githubUrl ? { codeRepository: skill.githubUrl } : {}),
          }}
        />
      )}
      {children}
    </>
  );
}
