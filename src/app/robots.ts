import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Auth-gated and machine-only surfaces, blocked at both the unprefixed path
  // and any locale prefix (e.g. /admin and /zh/admin). `/api/` is never under a
  // locale, so it needs no wildcard variant. /bookmarks belongs here for the
  // same reason as /dashboard and /profile: signed out it is only ever the
  // sign-in placeholder, so every locale of it is one duplicate of that page.
  const gated = ["/admin", "/dashboard", "/profile", "/bookmarks", "/auth/"];
  const disallow = [
    ...gated,
    ...gated.map((p) => `/*${p}`),
    "/api/",
    // Every gated page and the header link to /auth/signin?callbackUrl=<current
    // path>, so the sign-in page multiplies out into one crawlable URL per page
    // per locale. The /auth/ rules above already cover today's links; this one
    // holds wherever the parameter lands, since `*` swallows both the `?` and
    // the `&` form.
    "/*callbackUrl=",
  ];

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
