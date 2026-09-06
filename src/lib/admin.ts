import { auth } from "./auth";
import { prisma } from "./prisma";
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "./requestLog";
import { resolveApiUser } from "./api-user";

type AdminUser = { id: string; name: string | null; email: string | null; role: string };

/**
 * Resolve the acting admin, or a reason why not.
 *
 * "not signed in" and "signed in but not an admin" are different answers and used
 * to collapse into a single 403 with the body "Unauthorized" — which told a client
 * nothing about whether logging in would help, and contradicted the 401 that
 * lib/api.ts uses for the same condition everywhere else.
 */
async function resolveAdmin(req?: NextRequest): Promise<
  { ok: true; admin: AdminUser } | { ok: false; reason: "anonymous" | "not-admin" }
> {
  if (req) {
    const apiKey = req.headers.get("x-api-key") ?? req.headers.get("authorization");
    if (apiKey) {
      const user = await resolveApiUser(req);
      if (!user) return { ok: false, reason: "anonymous" };
      if (user.role !== "admin") return { ok: false, reason: "not-admin" };
      return { ok: true, admin: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
  }

  // Session path: role rides on the JWT, so the hot path costs no DB round-trip.
  const session = await auth();
  const sUser = session?.user as { id?: string; name?: string | null; email?: string | null; role?: string } | undefined;
  if (!sUser?.id) return { ok: false, reason: "anonymous" };
  if (sUser.role !== "admin") return { ok: false, reason: "not-admin" };
  return {
    ok: true,
    admin: { id: sUser.id, name: sUser.name ?? null, email: sUser.email ?? null, role: sUser.role },
  };
}

/** Back-compatible helper: the acting admin, or null. */
export async function requireAdmin(req?: NextRequest): Promise<AdminUser | null> {
  const r = await resolveAdmin(req);
  return r.ok ? r.admin : null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
}

/**
 * Admin route wrapper: the requireAdmin gate plus HTTP request logging, so every
 * admin endpoint is uniformly authenticated, attributed to the acting admin, and
 * observable. Handlers receive the resolved admin.
 */
export async function withAdmin(
  req: NextRequest,
  path: string,
  handler: (admin: AdminUser, logCtx: { userId?: string | null }) => Promise<NextResponse>
): Promise<NextResponse> {
  return withRequestLog(req, path, async (logCtx) => {
    const r = await resolveAdmin(req);
    if (!r.ok) return r.reason === "anonymous" ? unauthorized() : forbidden();
    logCtx.userId = r.admin.id;
    return handler(r.admin, logCtx);
  });
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail?: string
) {
  await prisma.adminLog.create({
    data: { adminId, action, targetType, targetId, detail },
  });
}
