import { createHash } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { extractClientIp } from "./ratelimit";

let warnedNoSalt = false;

/**
 * Day-rotating, salted digest of the client IP — what goes into `RequestLog.ipHash`
 * in place of the address itself.
 *
 * The old column stored the raw IP: personal data, kept forever (nothing purged
 * this table), on a db-f1-micro with a 10 GB disk. It also served no purpose it
 * could be trusted for, because the value comes from the first element of a
 * caller-supplied X-Forwarded-For — a privacy liability that was not usable as
 * evidence either.
 *
 * A digest keeps what the column was actually good for ("were these two requests
 * from the same source?") and drops what it was not. The UTC date is mixed into the
 * hash so the same address yields a different digest each day, which bounds
 * correlation to a single day without any extra deletion machinery.
 *
 * Returns null when TAKO_IP_SALT is unset: an unsalted digest of a 32-bit address
 * space is trivially reversible by brute force, so no value is better than a
 * reversible one. That case is warned about once per process, not silently.
 */
export function hashClientIp(req: NextRequest): string | null {
  const salt = process.env.TAKO_IP_SALT;
  if (!salt) {
    if (!warnedNoSalt) {
      warnedNoSalt = true;
      console.warn("[requestLog] TAKO_IP_SALT is unset — RequestLog.ipHash will be null");
    }
    return null;
  }
  const ip = extractClientIp(req);
  if (!ip || ip === "anon") return null;
  const day = new Date().toISOString().slice(0, 10); // UTC date, YYYY-MM-DD
  // 128 bits is far past collision concerns here and halves the stored width.
  return createHash("sha256").update(`${ip}|${day}|${salt}`).digest("hex").slice(0, 32);
}

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
        ipHash: hashClientIp(req),
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
