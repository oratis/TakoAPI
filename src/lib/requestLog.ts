import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { extractClientIp } from "./ratelimit";

type LogInput = {
  req: NextRequest;
  path: string;
  status: number;
  durationMs: number;
  userId?: string | null;
  errorCode?: string | null;
};

const inflight = new Set<Promise<unknown>>();

export function logRequest(input: LogInput): void {
  const { req, path, status, durationMs, userId, errorCode } = input;
  const p = prisma.requestLog
    .create({
      data: {
        path,
        method: req.method,
        status,
        durationMs,
        userId: userId ?? null,
        ip: extractClientIp(req) ?? null,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        errorCode: errorCode ?? null,
      },
    })
    .catch((err) => {
      console.error("requestLog failed:", err);
    })
    .finally(() => {
      inflight.delete(p);
    });
  inflight.add(p);
}

export async function flushRequestLogs(): Promise<void> {
  await Promise.allSettled(Array.from(inflight));
}
