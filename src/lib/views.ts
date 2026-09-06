import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractClientIp } from "@/lib/ratelimit";

// Skill view counting with per-visitor-per-day deduplication.
//
// The old counter incremented on every GET of the detail API, so bots, link
// previews and prefetches inflated it at will. Now a view is recorded once per
// (skill, visitor, UTC day): the visitor key is a salted hash of IP + user agent
// that rotates daily, stored in the existing SkillEvent table (type = "view") which
// was in the schema but never written. Only when the dedupe row is new does
// viewsCount move. The hash is not reversible to an address without the salt, and
// even with it only identifies a source for one day.

function visitorKey(req: NextRequest): string {
  const salt = process.env.TAKO_IP_SALT || "unsalted-dev";
  const ip = extractClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${ua}|${day}|${salt}`).digest("hex").slice(0, 32);
}

const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|headless|curl|wget|python-requests|go-http-client/i;

/** Returns true when the view was new (and counted). Never throws. */
export async function recordSkillView(skillId: string, req: NextRequest): Promise<boolean> {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return false;
  const key = `v1:${visitorKey(req)}`;
  try {
    const seen = await prisma.skillEvent.findFirst({
      where: { skillId, type: "view", referrer: key },
      select: { id: true },
    });
    if (seen) return false;
    await prisma.$transaction([
      prisma.skillEvent.create({ data: { id: crypto.randomUUID(), skillId, type: "view", referrer: key } }),
      prisma.skill.update({ where: { id: skillId }, data: { viewsCount: { increment: 1 } } }),
    ]);
    return true;
  } catch (err) {
    console.error("[views] failed to record view", { skillId, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Age out dedupe rows older than `days` (they only matter for one day). */
export async function pruneSkillViewEvents(days = 3): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const r = await prisma.skillEvent.deleteMany({ where: { type: "view", createdAt: { lt: cutoff } } });
  return r.count;
}
