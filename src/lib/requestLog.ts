import type { NextRequest, NextResponse } from "next/server";
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

type HandlerContext = { userId?: string | null };

export async function withRequestLog<T extends NextResponse>(
  req: NextRequest,
  path: string,
  handler: (ctx: HandlerContext) => Promise<T>
): Promise<T> {
  const ctx: HandlerContext = {};
  const start = Date.now();
  let response: T;
  try {
    response = await handler(ctx);
  } catch (err) {
    logRequest({
      req,
      path,
      status: 500,
      durationMs: Date.now() - start,
      userId: ctx.userId ?? null,
      errorCode: "UNCAUGHT",
    });
    throw err;
  }
  logRequest({
    req,
    path,
    status: response.status,
    durationMs: Date.now() - start,
    userId: ctx.userId ?? null,
  });
  return response;
}

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
