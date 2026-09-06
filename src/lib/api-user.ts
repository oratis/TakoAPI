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

/** True when a key-authenticated caller may perform `scope` (sessions always may). */
export function hasScope(user: ApiUser, scope: "read" | "invoke" | "submit" | "admin"): boolean {
  if (user.via === "session") return scope !== "admin" || user.role === "admin";
  if (scope === "admin") return user.role === "admin" && (user.scopes.length === 0 || user.scopes.includes("admin"));
  return user.scopes.length === 0 || user.scopes.includes(scope);
}
