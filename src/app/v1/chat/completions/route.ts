import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, newRpcId } from "@/lib/apikey";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

// OpenAI-compatible shim: point any OpenAI SDK at this base URL and set
// `model` to an agent slug. Low-friction on-ramp to the gateway.
// See docs/agent-marketplace/01-landscape-and-standards.md (lingua franca).
const TIMEOUT_MS = 30_000;

type A2APart = { text?: string };
type A2AResponse = {
  result?: {
    artifacts?: Array<{ parts?: A2APart[] }>;
    parts?: A2APart[];
    message?: { parts?: A2APart[] };
  };
} | null;

function extractText(data: unknown): string {
  const d = data as A2AResponse;
  const parts = d?.result?.artifacts?.[0]?.parts ?? d?.result?.parts ?? d?.result?.message?.parts ?? [];
  return parts.map((p) => p?.text ?? "").join("");
}

export async function POST(req: NextRequest) {
  const keyRecord = await authenticateApiKey(
    req.headers.get("authorization") || req.headers.get("x-api-key")
  );
  if (!keyRecord) {
    return NextResponse.json(
      { error: { message: "Invalid or missing API key", type: "authentication_error" } },
      { status: 401 }
    );
  }

  const rl = checkRateLimit(req, { key: `gw:${keyRecord.id}`, windowMs: 60_000, max: 120 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const body = await req.json().catch(() => ({}));
  const slug = typeof body?.model === "string" ? body.model : "";
  const messages: Array<{ role?: string; content?: string }> = Array.isArray(body?.messages)
    ? body.messages
    : [];
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  const text = typeof lastUser?.content === "string" ? lastUser.content : "";

  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true, endpointUrl: true },
  });
  if (!agent) {
    return NextResponse.json(
      { error: { message: `Unknown agent '${slug}'`, type: "invalid_request_error" } },
      { status: 404 }
    );
  }

  const rpc = {
    jsonrpc: "2.0",
    id: newRpcId(),
    method: "message/send",
    params: { message: { role: "user", parts: [{ kind: "text", text }] } },
  };

  const started = Date.now();
  let status = 502;
  let errorCode: string | null = null;
  let replyText = "";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(agent.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(rpc),
      signal: ctrl.signal,
    });
    status = res.status;
    replyText = extractText(await res.json().catch(() => null));
  } catch {
    errorCode = "UPSTREAM_UNREACHABLE";
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;

  prisma.invocation
    .create({
      data: {
        apiKeyId: keyRecord.id,
        userId: keyRecord.userId,
        agentId: agent.id,
        protocol: "OPENAI_COMPAT",
        status,
        latencyMs,
        unitsBilled: 1,
        errorCode,
      },
    })
    .catch(() => {});
  prisma.agent
    .update({ where: { id: agent.id }, data: { callsCount: { increment: 1 } } })
    .catch(() => {});

  if (errorCode) {
    return NextResponse.json(
      { error: { message: "Agent unreachable", type: "upstream_error" } },
      { status: 502 }
    );
  }

  return NextResponse.json({
    id: `chatcmpl_${newRpcId()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: slug,
    choices: [
      { index: 0, message: { role: "assistant", content: replyText }, finish_reason: "stop" },
    ],
  });
}
