import { childCount, renderIndex, SITEMAP_HEADERS } from "@/lib/sitemap-shape";

// Sitemap index at /sitemap.xml — lists the chunked children at /sitemap/{id}.xml.
// Hand-rolled because Next's sitemap.ts metadata convention can't emit a
// <sitemapindex> (see @/lib/sitemap-shape).
export const dynamic = "force-dynamic";

export async function GET() {
  const xml = renderIndex(await childCount(), new Date().toISOString());
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
