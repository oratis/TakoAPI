import type { NextRequest } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { authenticateApiKey } from "./apikey";

// One resolver for "who is calling this API?" — used by every route that accepts
// either a browser session or a programmatic key. Replaces four hand-rolled copies
// of the same lookup (skills/submit, agents/submit, skills/[id]/like, user/skills).
//
// Accepted credentials, in order:
//   1. `Authorization: Bearer tako_live_…` / `x-api-key: tako_live_…` — a hashed
//      gateway key from the ApiKey table (the only kind issued since this change).
//   2. `x-api-key: tako_…` — a legacy plaintext User.apiKey. Still honoured so
//      existing integrations keep working during the migration window, but no new
//      keys of this kind are created. See docs/08-tech-review-2026-09-05.md §1.4.
//   3. The NextAuth session cookie.

export type ApiUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  /** How the caller authenticated; lets routes treat legacy keys differently. */
  via: "apikey" | "legacy-apikey" | "session";
  /** Scopes on the ApiKey row when via === "apikey" (empty = unrestricted legacy row). */
  scopes: string[];
};

const USER_SELECT = { id: true, name: true, email: true, role: true } as const;

export async function resolveApiUser(req: NextRequest): Promise<ApiUser | null> {
  const bearer = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");
  const raw = bearer?.startsWith("Bearer ") ? bearer : xApiKey;

  if (raw) {
    const record = await authenticateApiKey(raw);
    if (record) {
      const user = await prisma.user.findUnique({ where: { id: record.userId }, select: USER_SELECT });
      return user ? { ...user, via: "apikey", scopes: record.scopes } : null;
    }
    const legacy = raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
    if (legacy.startsWith("tako_") && !legacy.startsWith("tako_live_")) {
      const user = await prisma.user.findUnique({ where: { apiKey: legacy }, select: USER_SELECT });
      if (user) return { ...user, via: "legacy-apikey", scopes: [] };
    }
    // A credential was presented but did not resolve — do not fall through to the
    // cookie, or a bad key would silently act as the browser session.
    return null;
  }

  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: USER_SELECT });
  return user ? { ...user, via: "session", scopes: [] } : null;
}

/**
 * True when the caller may perform `scope`.
 *
 * `admin` is deliberately not part of the "no scopes means unrestricted" rule that
 * covers the read/invoke/submit surface. Every key `/api/keys` issues today has an
 * empty `scopes` array, and those keys are meant to be pasted into MCP clients and
 * CI config; if an empty array granted `admin`, an admin's ordinary gateway key
 * would be a full admin credential. `admin` requires the scope to be named, which
 * nothing currently sets — so today only a session (or the legacy `User.apiKey`)
 * reaches the admin surface, which is the intended blast radius.
 */
export function hasScope(user: ApiUser, scope: "read" | "invoke" | "submit" | "admin"): boolean {
  if (scope === "admin") {
    if (user.role !== "admin") return false;
    // A session, or the single-purpose legacy key, is already admin-shaped.
    if (user.via !== "apikey") return true;
    return user.scopes.includes("admin");
  }
  if (user.via === "session") return true;
  return user.scopes.length === 0 || user.scopes.includes(scope);
}


/**
 * May this credential publish straight to the catalog, skipping the review queue?
 *
 * Auto-approval is a moderation bypass, so it stays with the credential that was
 * always meant to carry it: an admin's single-purpose legacy key. A gateway key
 * (`tako_live_…`) is handed out to MCP clients and CI — /docs tells users to paste
 * it into third-party config — so it submits like anyone else and waits for review,
 * even when its owner is an admin. A browser session is a human at the form, who
 * also queues.
 *
 * This lives here because it was previously written out twice, and the two copies
 * drifted: /api/skills/submit tightened to `via === "legacy-apikey"` while
 * /api/agents/submit kept `via !== "session"`, which still matched `via === "apikey"`
 * and let any leaked gateway key publish an agent — endpoint, price and all —
 * into the public catalog with no moderator in the loop.
 */
export function canBypassModeration(user: ApiUser): boolean {
  return user.role === "admin" && user.via === "legacy-apikey";
}
