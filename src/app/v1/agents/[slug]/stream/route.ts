import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, gatewayRateLimit, newRpcId } from "@/lib/apikey";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import {
  checkCreditPreflight,
  computeBilledUsd,
  meterInvocation,
  settleInvocation,
  startInvocation,
} from "@/lib/billing";

// Streaming gateway — A2A message/stream passthrough over SSE.
// Note: behind a Global HTTPS LB + serverless NEG, SSE can be throttled; prefer
// the direct Cloud Run URL for streaming. See docs/.../03-technical-architecture.md §8.
const TIMEOUT_MS = 120_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const keyRecord = await authenticateApiKey(
    req.headers.get("authorization") || req.headers.get("x-api-key")
  );
  if (!keyRecord) {
    return Response.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, {
    key: `gw:${keyRecord.id}`,
    windowMs: 60_000,
    max: gatewayRateLimit(keyRecord),
    perIp: false,
  });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true, endpointUrl: true, pricingModel: true, unitPriceUsd: true },
  });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (!agent.endpointUrl) {
    return Response.json(
      { error: "This agent is an open-source project, not an invokable endpoint" },
      { status: 400 }
    );
  }

  // Pre-flight credit gate — reject before the (billable) upstream call so a looping
  // caller can't run the balance arbitrarily negative. FREE/unpriced agents pass through.
  const credit = await checkCreditPreflight(keyRecord.userId, agent.pricingModel, agent.unitPriceUsd);
  if (!credit.ok) {
    return Response.json(
      {
        error: "Insufficient credit",
        detail: `This agent costs $${credit.requiredUsd} per call; your balance is $${credit.balanceUsd}. Add credit to continue.`,
        balanceUsd: credit.balanceUsd,
        requiredUsd: credit.requiredUsd,
      },
      { status: 402 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text =
    typeof body?.text === "string"
      ? body.text
      : typeof body?.message === "string"
        ? body.message
        : "";

  const rpc = {
    jsonrpc: "2.0",
    id: newRpcId(),
    method: "message/stream",
    params: { message: { role: "user", parts: [{ kind: "text", text }] } },
  };

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(agent.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(rpc),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    void meterInvocation({
      apiKeyId: keyRecord.id,
      userId: keyRecord.userId,
      agentId: agent.id,
      protocol: "A2A",
      status: 502,
      latencyMs: Date.now() - started,
      errorCode: "UPSTREAM_UNREACHABLE",
      billedUsd: 0,
    });
    return Response.json({ error: "Agent unreachable" }, { status: 502 });
  }

  const meterBase = {
    apiKeyId: keyRecord.id,
    userId: keyRecord.userId,
    agentId: agent.id,
    protocol: "A2A" as const,
  };

  // Upstream answered but there is nothing to stream — record the failure and bill
  // nothing. (Previously the charge had already been written by this point, so the
  // caller got a 502 with a paid-for, status-200 Invocation row behind it.)
  if (!upstream.body) {
    clearTimeout(timer);
    void meterInvocation({
      ...meterBase,
      status: 502,
      latencyMs: Date.now() - started,
      errorCode: "NO_STREAM_BODY",
      billedUsd: 0,
    });
    return Response.json({ error: "Agent did not return a stream" }, { status: 502 });
  }

  // Open the invocation now, unpriced, so a stream that dies mid-flight still counts
  // in the denominator; the charge is decided when the stream actually terminates.
  const invocationId = await startInvocation({
    ...meterBase,
    status: upstream.status,
    latencyMs: Date.now() - started,
    billedUsd: 0,
  });

  let settled = false;
  const settle = async (status: number, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Only a stream that ran to completion over a non-error response is billable.
    const billedUsd =
      !errorCode && status < 400 ? computeBilledUsd(agent.pricingModel, agent.unitPriceUsd) : 0;
    await settleInvocation(invocationId, {
      ...meterBase,
      status,
      latencyMs: Date.now() - started,
      errorCode,
      billedUsd,
    });
  };

  // Pass the upstream SSE through; clear the abort timer when it ends.
  const reader = upstream.body.getReader();
  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          clearTimeout(timer);
          // The stream completed — this is the only path that charges.
          await settle(upstream.status, null);
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        // Upstream broke mid-stream, or TIMEOUT_MS aborted it. The caller did not
        // get a complete answer, so bill nothing — but do record what happened.
        clearTimeout(timer);
        await settle(502, "STREAM_ABORTED");
        controller.error(err);
      }
    },
    async cancel() {
      reader.cancel().catch(() => {});
      clearTimeout(timer);
      await settle(499, "CLIENT_DISCONNECTED");
    },
  });

  return new Response(out, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
