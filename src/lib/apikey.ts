import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";

// Gateway API keys (Phase 2). We store only a SHA-256 hash + a display prefix;
// the full key is shown once at creation. See docs/agent-marketplace/03-technical-architecture.md §3.

const KEY_PREFIX = "tako_live_";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; hashedKey: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  // Display id: prefix + first 6 chars of the secret (safe to store/show).
  const prefix = `${KEY_PREFIX}${secret.slice(0, 6)}`;
  return { key, prefix, hashedKey: hashKey(key) };
}

export function newRpcId(): string {
  return randomUUID();
}

/** Gateway allowance (requests per 60s) for a key that sets no override. */
export const DEFAULT_GATEWAY_RATE_LIMIT = 120;

/**
 * Requests-per-window allowance for one API key: `ApiKey.rateLimit` when it holds a
 * positive value, otherwise the shared default. The column had existed since the
 * gateway shipped but nothing read it, so every key was pinned to the hard-coded
 * default and an abusive key could only be slowed down by changing that constant
 * for everyone.
 */
export function gatewayRateLimit(key: { rateLimit: number | null }): number {
  return key.rateLimit && key.rateLimit > 0 ? key.rateLimit : DEFAULT_GATEWAY_RATE_LIMIT;
}

/** Resolve an API key from an Authorization/x-api-key header value. Returns the
 *  active ApiKey record (with user) or null. Best-effort updates lastUsedAt. */
export async function authenticateApiKey(raw: string | null) {
  if (!raw) return null;
  const key = raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
  if (!key.startsWith(KEY_PREFIX)) return null;

  const record = await prisma.apiKey.findUnique({
    where: { hashedKey: hashKey(key) },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!record || record.revokedAt) return null;

  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return record;
}
