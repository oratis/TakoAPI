import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Trending Skills",
  description:
    "The most-downloaded and most-liked OpenClaw skills right now — a live leaderboard of what coding agents are installing.",
  alternates: { canonical: absoluteUrl("/trending") },
  openGraph: {
    title: `Trending Skills — ${SITE_NAME}`,
    description: "A live leaderboard of the most popular OpenClaw skills.",
    url: absoluteUrl("/trending"),
    type: "website",
  },
};

export default function TrendingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
