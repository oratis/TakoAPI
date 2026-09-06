import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CATALOG_CACHE_HEADERS } from "@/lib/http";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { skillCount: "desc" },
  });
  return NextResponse.json(categories, { headers: CATALOG_CACHE_HEADERS });
}
