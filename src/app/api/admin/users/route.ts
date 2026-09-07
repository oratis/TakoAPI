import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { NO_STORE_HEADERS } from "@/lib/http";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/users", async () => {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = clampPagination(searchParams);
    const q = searchParams.get("q");

    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        // Explicit select, not `include`: this table must never carry the password
        // hash or the plaintext apiKey column out of the database.
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          provider: true,
          createdAt: true,
          _count: { select: { skills: true, likes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json(
      {
        users,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      // Personal data — never cacheable by the CDN or the browser.
      { headers: NO_STORE_HEADERS }
    );
  });
}
