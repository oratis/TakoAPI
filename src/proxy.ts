import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// In Next.js 16 the request interceptor file is `proxy.ts` (formerly
// `middleware.ts`). next-intl's middleware factory returns a plain
// `(NextRequest) => NextResponse` handler, so it works unchanged here.
export default createMiddleware(routing);

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
