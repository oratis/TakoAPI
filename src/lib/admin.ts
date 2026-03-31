import { auth } from "./auth";
import { prisma } from "./prisma";
import { NextRequest, NextResponse } from "next/server";

export async function requireAdmin(req?: NextRequest) {
  // Check API key first
  if (req) {
    const apiKey = req.headers.get("x-api-key");
    if (apiKey) {
      const user = await prisma.user.findUnique({ where: { apiKey } });
      if (user?.role === "admin") return user;
      return null;
    }
  }

  // Check session
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (user?.role !== "admin") return null;
  return user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
