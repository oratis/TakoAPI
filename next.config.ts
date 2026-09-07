import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Baseline hardening headers for every response. A full Content-Security-Policy is
// deliberately not set here: Next's inline runtime scripts and the GA4 loader would
// need a per-request nonce, and a broken CSP takes the whole site down. Clickjacking
// is covered by frame-ancestors + X-Frame-Options, which need no nonce.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// Public, token-authenticated machine surfaces. Browsers can only call them
// cross-origin (an OpenAI SDK in a web app, a docs "Try it" widget) if CORS allows
// it. `*` is correct here: the API key travels in the Authorization header, never in
// cookies, so there is no ambient credential for a foreign origin to ride on.
const CORS_HEADERS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Api-Key" },
  { key: "Access-Control-Max-Age", value: "86400" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...["/v1/:path*", "/mcp", "/api/registry", "/api/agent", "/api/agents/:path*", "/api/skills/:path*", "/api/categories", "/api/badge/:path*"].map(
        (source) => ({ source, headers: CORS_HEADERS })
      ),
    ];
  },
};

export default withNextIntl(nextConfig);
