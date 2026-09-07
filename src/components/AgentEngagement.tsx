"use client";

import { Engagement } from "@/components/Engagement";

// Agent detail engagement bar — thin wrapper over the shared component.
export function AgentEngagement({ slug }: { slug: string }) {
  return <Engagement apiBase={`/api/agents/${encodeURIComponent(slug)}`} />;
}
