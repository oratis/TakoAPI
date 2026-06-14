import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, newRpcId } from "@/lib/apikey";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { computeBilledUsd, meterInvocation } from "@/lib/billing";

// Unified gateway — A2A passthrough. Authenticate with an API key, route to the
// agent's endpoint, meter the call. See docs/agent-marketplace/03-technical-architecture.md §2.
const TIMEOUT_MS = 30_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const keyRecord = await authenticateApiKey(
    req.headers.get("authorization") || req.headers.get("x-api-key")
  );
  if (!keyRecord) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const rl = checkRateLimit(req, { key: `gw:${keyRecord.id}`, windowMs: 60_000, max: 120 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true, endpointUrl: true, pricingModel: true, unitPriceUsd: true },
  });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (!agent.endpointUrl) {
    return NextResponse.json(
      { error: "This agent is an open-source project, not an invokable endpoint" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text =
    typeof body?.text === "string"
      ? body.text
      : typeof body?.message === "string"
        ? body.message
        : "";

  // A2A JSON-RPC message/send
  const rpc = {
    jsonrpc: "2.0",
    id: newRpcId(),
    method: "message/send",
    params: { message: { role: "user", parts: [{ kind: "text", text }] } },
  };

  const started = Date.now();
  let status = 502;
  let upstream: unknown = null;
  let errorCode: string | null = null;

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
    upstream = await res.json().catch(() => null);
  } catch {
    errorCode = "UPSTREAM_UNREACHABLE";
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;

  // Meter + bill (log → aggregate). Never block the response on metering.
  const billedUsd =
    !errorCode && status < 400 ? computeBilledUsd(agent.pricingModel, agent.unitPriceUsd) : 0;
  void meterInvocation({
    apiKeyId: keyRecord.id,
    userId: keyRecord.userId,
    agentId: agent.id,
    protocol: "A2A",
    status,
    latencyMs,
    errorCode,
    billedUsd,
  });

  if (errorCode) {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
  return NextResponse.json(upstream, { status });
}
