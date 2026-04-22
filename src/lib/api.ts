import { NextResponse } from "next/server";
import { z } from "zod";

export type ApiError = {
  error: string;
  code?: string;
  details?: Array<{ path: string; message: string }>;
};

export function jsonError(
  message: string,
  status: number,
  code?: string,
  details?: ApiError["details"]
) {
  const body: ApiError = { error: message };
  if (code) body.code = code;
  if (details) body.details = details;
  return NextResponse.json(body, { status });
}

export function badRequest(message: string, details?: ApiError["details"]) {
  return jsonError(message, 400, "BAD_REQUEST", details);
}

export function unauthorized(message = "Unauthorized") {
  return jsonError(message, 401, "UNAUTHORIZED");
}

export function forbidden(message = "Forbidden") {
  return jsonError(message, 403, "FORBIDDEN");
}

export function notFound(message = "Not found") {
  return jsonError(message, 404, "NOT_FOUND");
}

export function conflict(message: string) {
  return jsonError(message, 409, "CONFLICT");
}

export function serverError(message = "Internal error") {
  return jsonError(message, 500, "INTERNAL");
}

export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest("Invalid JSON body") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { ok: false, response: badRequest("Validation failed", details) };
  }
  return { ok: true, data: result.data };
}
