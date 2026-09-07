"use client";

import { fetchJson, useAsync } from "@/hooks/useAsync";

// Records one view for the skill and renders nothing.
//
// viewsCount used to be incremented by GET /api/skills/[id], so every crawler,
// link preview and prefetch inflated it. The counter now moves only from this
// ping, which needs a real browser to fire, and the route deduplicates per
// visitor per UTC day. A failed ping is not worth surfacing.
export function SkillViewPing({ idOrSlug }: { idOrSlug: string }) {
  useAsync(
    () => fetchJson(`/api/skills/${encodeURIComponent(idOrSlug)}/view`, { method: "POST" }).catch(() => null),
    [idOrSlug]
  );
  return null;
}
