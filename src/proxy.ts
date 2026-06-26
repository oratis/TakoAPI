import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import type { NextRequest } from "next/server";

// In Next.js 16 the request interceptor file is `proxy.ts` (formerly
// `middleware.ts`). next-intl's middleware factory returns a plain
// `(NextRequest) => NextResponse` handler, which we wrap to add SEO headers.
const handle = createMiddleware(routing);

const NON_DEFAULT_LOCALES = new Set<string>(routing.locales.filter((l) => l !== routing.defaultLocale));

// Entity DETAIL pages (/{locale}/agents/{slug}, /{locale}/skills/{slug}) carry
// English-only bodies (scraped repo descriptions / AgentCards / READMEs); the 14
// non-default locales are translated UI chrome around identical content. Emit
// `X-Robots-Tag: noindex` on those so the 15-locale fan-out isn't read as scaled /
// duplicate content. `follow` keeps link equity flowing, and hreflang still points
// crawlers at the canonical English page (which stays indexable). Listing,
// scenario, and marketing pages are genuinely translated, so they keep indexing in
// every locale.
function isNonDefaultLocaleEntityDetail(pathname: string): boolean {
  const seg = pathname.split("/").filter(Boolean);
  return seg.length >= 3 && NON_DEFAULT_LOCALES.has(seg[0]) && (seg[1] === "agents" || seg[1] === "skills");
}

export default function proxy(req: NextRequest) {
  const res = handle(req);
  if (isNonDefaultLocaleEntityDetail(req.nextUrl.pathname)) {
    res.headers.set("X-Robots-Tag", "noindex, follow");
  }
  return res;
}

export const config = {
  // Run on page routes only. Exclude:
  //  - api / v1 / mcp  → JSON & machine-readable route handlers (next-auth,
  //    OpenAI-compat, A2A, MCP) must never be locale-rewritten
  //  - _next / _vercel → framework internals
  //  - opengraph-image / twitter-image / icon → extensionless metadata routes
  //    (no dot, so the trailing dot-rule below wouldn't catch them)
  //  - anything containing a dot → sitemap.xml, robots.txt,
  //    manifest.webmanifest, favicon.ico, *.png/.svg, etc.
  matcher: [
    "/((?!api|v1|mcp|_next|_vercel|opengraph-image|twitter-image|icon|.*\\..*).*)",
  ],
};
