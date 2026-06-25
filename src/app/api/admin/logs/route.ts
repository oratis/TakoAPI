import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/logs", async () => {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "30");

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        include: { admin: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminLog.count(),
    ]);

    return NextResponse.json({
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });
}
