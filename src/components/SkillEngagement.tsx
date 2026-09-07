"use client";

import { Engagement } from "@/components/Engagement";

// Skill detail engagement bar — thin wrapper over the shared component.
export function SkillEngagement({ idOrSlug }: { idOrSlug: string }) {
  return <Engagement apiBase={`/api/skills/${encodeURIComponent(idOrSlug)}`} framed={false} />;
}
