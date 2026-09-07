import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordSkillView } from "@/lib/views";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { NO_STORE_HEADERS } from "@/lib/http";

// Record one page view for a skill, deduplicated per visitor per UTC day. Called by
// the detail page after it renders (a crawler fetching the JSON API no longer
// counts). Never fails the caller: a lost view is not worth an error.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Unauthenticated write, so it needs a ceiling. The budget is per SKILL rather
  // than per caller: the dedupe key inside recordSkillView is derived from headers
  // the caller controls, so a per-caller budget could be rotated away, while a
  // per-skill one bounds how fast any single counter can be inflated no matter how
  // many sources push it. 60/minute is far above what a real page produces (one
  // POST per visitor per render) and far below what makes the number meaningless.
  const rl = await checkRateLimit(req, {
    key: `view:${id.slice(0, 80)}`,
    windowMs: 60_000,
    max: 60,
    perIp: false,
  });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const skill = await prisma.skill.findFirst({
    where: { OR: [{ id }, { slug: id }], status: "APPROVED" },
    select: { id: true },
  });
  if (!skill) return NextResponse.json({ counted: false }, { status: 404 });

  const counted = await recordSkillView(skill.id, req);
  return NextResponse.json({ counted }, { headers: NO_STORE_HEADERS });
}
