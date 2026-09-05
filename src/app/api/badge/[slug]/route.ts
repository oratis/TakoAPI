import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logRequest } from "@/lib/requestLog";

export const dynamic = "force-dynamic";

// Owned "TakoAPI" README badge (shields-style flat SVG). Dynamic value: a
// project's live star count, or "listed" for hosted agents — giving repos a
// reason to embed ours over a static shields.io badge (it updates, and every
// render is an impression on our own domain). Embedded via the snippet on each
// /agents/[slug] page and the /badge how-to.

function fmtStars(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Rough monospace-ish width estimate for Verdana 11px; fine for a small badge.
function textWidth(s: string): number {
  return Math.ceil(s.length * 6.5);
}

function badgeSvg(label: string, value: string): string {
  const PAD = 12;
  const lw = textWidth(label) + PAD;
  const vw = textWidth(value) + PAD;
  const w = lw + vw;
  const lx = lw / 2;
  const vx = lw + vw / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="20" fill="#555"/>
<rect x="${lw}" width="${vw}" height="20" fill="#7c3aed"/>
<rect width="${w}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lx}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text>
<text x="${lx}" y="14">${esc(label)}</text>
<text x="${vx}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text>
<text x="${vx}" y="14">${esc(value)}</text>
</g>
</svg>`;
}

function svgResponse(svg: string, status: number, maxAge: number): NextResponse {
  return new NextResponse(svg, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=3600, stale-while-revalidate=86400`,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const start = Date.now();
  const { slug } = await params;

  // Log every render so badge adoption is quantifiable: path is per-slug
  // (`/api/badge/<slug>`, covered by RequestLog's [path, createdAt] index), so
  // counting rows per path = renders per repo. Note: when the badge is embedded
  // in a GitHub README, GitHub's camo proxy fetches it and strips Referer, so
  // attribution is by slug + volume, not by referring page. Fire-and-forget;
  // never blocks or fails the SVG response.
  const log = (status: number) =>
    logRequest({ req, path: `/api/badge/${slug}`, status, durationMs: Date.now() - start });

  const agent = await prisma.agent.findFirst({
    where: { OR: [{ slug }, { id: slug }], status: "APPROVED" },
    select: { kind: true, stars: true },
  });
  if (!agent) {
    log(404);
    return svgResponse(badgeSvg("TakoAPI", "not listed"), 404, 300);
  }
  const value =
    agent.kind === "PROJECT" && typeof agent.stars === "number" ? `★ ${fmtStars(agent.stars)}` : "listed";
  log(200);
  return svgResponse(badgeSvg("TakoAPI", value), 200, 600);
}
