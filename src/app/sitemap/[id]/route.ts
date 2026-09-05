import { entriesFor, renderUrlset, SITEMAP_HEADERS } from "@/lib/sitemap-shape";

// Child sitemap at /sitemap/{id}.xml. The dynamic segment is "{id}.xml" (e.g.
// "3.xml"); parseInt stops at the dot. Listed by the index at /sitemap.xml.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number.parseInt(id, 10);
  if (!Number.isInteger(n) || n < 0) {
    return new Response("Not found", { status: 404 });
  }
  const xml = renderUrlset(await entriesFor(n));
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
