import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/logs", async () => {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = clampPagination(searchParams);

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        include: { admin: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.adminLog.count(),
    ]);

    return NextResponse.json(
      {
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      // Audit trail with admin emails — never cacheable.
      { headers: NO_STORE_HEADERS }
    );
  });
}
