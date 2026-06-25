import { auth } from "./auth";
import { prisma } from "./prisma";
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "./requestLog";

type AdminUser = { id: string; name: string | null; email: string | null; role: string };

export async function requireAdmin(req?: NextRequest): Promise<AdminUser | null> {
  // API key path (for programmatic access)
  if (req) {
    const apiKey = req.headers.get("x-api-key");
    if (apiKey) {
      const user = await prisma.user.findUnique({
        where: { apiKey },
        select: { id: true, name: true, email: true, role: true },
      });
      if (user?.role === "admin") return user;
      return null;
    }
  }

  // Session path: role is on the JWT, avoid hitting the DB on the hot path.
  const session = await auth();
  const sUser = session?.user as { id?: string; name?: string | null; email?: string | null; role?: string } | undefined;
  if (!sUser?.id || sUser.role !== "admin") return null;
  return {
    id: sUser.id,
    name: sUser.name ?? null,
    email: sUser.email ?? null,
    role: sUser.role,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

// Admin route wrapper: pairs the requireAdmin gate with HTTP request logging
// (RequestLog), so every admin endpoint is uniformly authenticated, attributed
// to the acting admin, and observable. Handlers receive the resolved admin.
export async function withAdmin(
  req: NextRequest,
  path: string,
  handler: (admin: AdminUser, logCtx: { userId?: string | null }) => Promise<NextResponse>
): Promise<NextResponse> {
  return withRequestLog(req, path, async (logCtx) => {
    const admin = await requireAdmin(req);
    if (!admin) return unauthorized();
    logCtx.userId = admin.id;
    return handler(admin, logCtx);
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
