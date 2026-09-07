import type { Prisma } from "@prisma/client";

// The public shape of an Agent. Every anonymous endpoint that returns agents goes
// through this whitelist so a new column on the model never leaks by default.
// Deliberately excluded: reviewNote (moderator notes), publisherId / categoryId
// (internal ids), securitySchemes is kept (it comes from the agent's own public
// AgentCard and integrators need it), publisher avatar (a Google profile URL).
export const PUBLIC_AGENT_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  kind: true,
  scenarios: true,
  cardUrl: true,
  endpointUrl: true,
  protocols: true,
  streaming: true,
  pushNotify: true,
  securitySchemes: true,
  cardSignatureVerified: true,
  namespaceVerified: true,
  healthStatus: true,
  healthCheckedAt: true,
  pricingModel: true,
  unitPriceUsd: true,
  byokSupported: true,
  githubUrl: true,
  stars: true,
  repoOwner: true,
  repoName: true,
  homepage: true,
  logo: true,
  featured: true,
  likesCount: true,
  callsCount: true,
  avgRating: true,
  ratingCount: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  publisher: { select: { name: true, username: true } },
} satisfies Prisma.AgentSelect;

export type PublicAgentRow = Prisma.AgentGetPayload<{ select: typeof PUBLIC_AGENT_SELECT }>;

/** Serialize Decimal + normalize for JSON consumers. */
export function toPublicAgent<T extends { unitPriceUsd: unknown }>(row: T) {
  return {
    ...row,
    unitPriceUsd: row.unitPriceUsd == null ? null : Number(row.unitPriceUsd),
  };
}
