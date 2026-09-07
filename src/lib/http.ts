// Shared HTTP response helpers for public, anonymous, read-only endpoints.
//
// Catalog data changes on the scale of minutes-to-hours (scrapers run nightly,
// admin approvals are rare), so public GETs can be served from the CDN / browser
// cache for a short window and refreshed in the background. Anything that is
// per-user (session, keys, usage) must NOT use these headers.

/** 60 s fresh at the edge, then served stale for up to 5 min while revalidating. */
export const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
} as const;

/** Longer window for catalog listings that only change when a scraper runs. */
export const CATALOG_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
} as const;

/** Explicitly uncacheable — for per-user or mutating responses. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;
