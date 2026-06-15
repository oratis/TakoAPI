import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Auth-gated and machine-only surfaces, blocked at both the unprefixed path
  // and any locale prefix (e.g. /admin and /zh/admin). `/api/` is never under a
  // locale, so it needs no wildcard variant.
  const gated = ["/admin", "/dashboard", "/profile", "/auth/"];
  const disallow = [...gated, ...gated.map((p) => `/*${p}`), "/api/"];

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
