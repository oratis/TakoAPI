import { PrismaClient } from "@prisma/client";

const shared = globalThis as typeof globalThis & { prisma?: PrismaClient };

function createClient() {
  const raw = process.env.DATABASE_URL;
  if (!raw || !process.env.K_SERVICE) return new PrismaClient();
  const url = new URL(raw);
  url.searchParams.set("connection_limit", process.env.TAKO_DB_POOL_SIZE || "2");
  return new PrismaClient({ datasourceUrl: url.toString() });
}

export const prisma = shared.prisma ??= createClient();
