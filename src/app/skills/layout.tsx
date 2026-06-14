import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

// The skills pages are client components and can't export metadata themselves,
// so this server layout supplies it. Detail pages override via [slug]/layout.tsx.
export const metadata: Metadata = {
  title: "Browse Skills",
  description:
    "Browse thousands of OpenClaw skills for your coding agent across dozens of categories — with search, filtering, and a trending leaderboard.",
  alternates: { canonical: absoluteUrl("/skills") },
  openGraph: {
    title: `Browse Skills — ${SITE_NAME}`,
    description: "Thousands of OpenClaw skills for your coding agent.",
    url: absoluteUrl("/skills"),
    type: "website",
  },
};

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
