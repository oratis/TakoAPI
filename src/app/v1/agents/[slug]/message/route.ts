import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, gatewayRateLimit, newRpcId } from "@/lib/apikey";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { logGatewayRejection } from "@/lib/gatewayLog";
import { checkCreditPreflight, computeBilledUsd, debitInvocation, meterInvocation } from "@/lib/billing";

// Unified gateway — A2A passthrough. Authenticate with an API key, route to the
// agent's endpoint, meter the call. See docs/agent-marketplace/03-technical-architecture.md §2.
const TIMEOUT_MS = 30_000;
const ROUTE = "/v1/agents/[slug]/message";

// Two request shapes, on purpose:
//   { text: "..." }                                  — the shorthand the installed skill,
//                                                      the MCP `invoke_agent` tool and every
//                                                      docs/README snippet send.
//   { message: { role, parts }, taskId, contextId }  — a real A2A message, so a multi-turn
//                                                      task can be continued through the
//                                                      gateway and file/data parts survive.
// `parts` is loose: we only need to read text parts, and a file or data part must reach the
// upstream with its payload intact rather than being stripped by a strict schema.
const partSchema = z.looseObject({
  kind: z.string().optional(),
  text: z.string().optional(),
});

const bodySchema = z.object({
  text: z.string().optional(),
  message: z
    .union([
      z.string(),
      z.looseObject({
        role: z.enum(["user", "agent"]).optional(),
        parts: z.array(partSchema).optional(),
        messageId: z.string().optional(),
        taskId: z.string().optional(),
        contextId: z.string().optional(),
      }),
    ])
    .optional(),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
});

type A2APart = z.infer<typeof partSchema>;

/** True when a part actually carries something for the agent to act on. */
function hasContent(part: A2APart): boolean {
  if (typeof part.text === "string" && part.text.length > 0) return true;
  // file/data parts keep their payload under keys we deliberately don't inspect, so a
  // part that names a non-text kind counts as content even though it reads as empty here.
  return typeof part.kind === "string" && part.kind !== "text";
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * The A2A Message to forward, or null when the request carries nothing to say.
 *
 * `taskId` / `contextId` are accepted at the top level for convenience but belong on the
 * Message itself in A2A, which is where they are placed; a value already inside `message`
 * wins. `messageId` is required by the spec and generated when the caller omits it.
 */
function buildMessage(body: z.infer<typeof bodySchema>): Record<string, unknown> | null {
  const supplied = typeof body.message === "object" ? body.message : undefined;
  const shorthand = body.text ?? (typeof body.message === "string" ? body.message : undefined);

  const parts: A2APart[] = supplied?.parts
    ? supplied.parts.map((part) =>
        // A2A discriminates parts by `kind`; fill it in for a caller that sent bare text.
        part.kind === undefined && typeof part.text === "string" ? { ...part, kind: "text" } : part
      )
    : shorthand !== undefined
      ? [{ kind: "text", text: shorthand }]
      : [];
  if (!parts.some(hasContent)) return null;

  const taskId = supplied?.taskId ?? body.taskId;
  const contextId = supplied?.contextId ?? body.contextId;
  return {
    ...supplied,
    kind: "message",
    messageId: supplied?.messageId ?? newRpcId(),
    role: supplied?.role ?? "user",
    parts,
    ...(taskId ? { taskId } : {}),
    ...(contextId ? { contextId } : {}),
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const keyRecord = await authenticateApiKey(
    req.headers.get("authorization") || req.headers.get("x-api-key")
  );
  if (!keyRecord) {
    logGatewayRejection({ route: ROUTE, reason: "unauthenticated", status: 401, agentSlug: slug });
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, {
    key: `gw:${keyRecord.id}`,
    windowMs: 60_000,
    max: gatewayRateLimit(keyRecord),
    perIp: false,
  });
  if (!rl.ok) {
    logGatewayRejection({
      route: ROUTE,
      reason: "rate_limited",
      status: 429,
      apiKeyId: keyRecord.id,
      userId: keyRecord.userId,
      agentSlug: slug,
    });
    return rateLimitResponse(rl.retryAfterMs);
  }

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

  // Pre-flight credit gate — reject before the (billable) upstream call so a looping
  // caller can't run the balance arbitrarily negative. FREE/unpriced agents pass through.
  const credit = await checkCreditPreflight(keyRecord.userId, agent.pricingModel, agent.unitPriceUsd);
  if (!credit.ok) {
    logGatewayRejection({
      route: ROUTE,
      reason: "insufficient_credit",
      status: 402,
      apiKeyId: keyRecord.id,
      userId: keyRecord.userId,
      agentSlug: slug,
      requiredUsd: credit.requiredUsd,
      balanceUsd: credit.balanceUsd,
    });
    return NextResponse.json(
      {
        error: "Insufficient credit",
        detail: `This agent costs $${credit.requiredUsd} per call; your balance is $${credit.balanceUsd}. Add credit to continue.`,
        balanceUsd: credit.balanceUsd,
        requiredUsd: credit.requiredUsd,
      },
      { status: 402 }
    );
  }

  const parsed = bodySchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    return NextResponse.json(
      { error: "Invalid request body", detail: path ? `${path}: ${issue.message}` : issue.message },
      { status: 400 }
    );
  }

  // An empty message is rejected here rather than forwarded: the upstream would be called
  // — and the caller billed — for a request that asks the agent nothing.
  const message = buildMessage(parsed.data);
  if (!message) {
    return NextResponse.json(
      {
        error: "Empty message",
        detail: 'Send { "text": "..." } or an A2A { "message": { "parts": [...] } } with content.',
      },
      { status: 400 }
    );
  }

  // A2A JSON-RPC message/send
  const rpc = {
    jsonrpc: "2.0",
    id: newRpcId(),
    method: "message/send",
    params: { message },
  };

  const started = Date.now();
  let status = 502;
  let upstream: unknown = null;
  let errorCode: string | null = null;
  let taskState: string | null = null;
  let unreachable = false;

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
    const envelope = obj(upstream);
    const result = obj(envelope?.result);
    if (!result && envelope?.error) {
      // JSON-RPC reports failures over HTTP 200. The caller still gets the envelope
      // unchanged, but it is not a served call and must not be charged for.
      errorCode = "UPSTREAM_RPC_ERROR";
    } else {
      const state = obj(result?.status)?.state;
      if (typeof state === "string") taskState = state;
    }
  } catch {
    errorCode = "UPSTREAM_UNREACHABLE";
    unreachable = true;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;

  // Meter + bill. A *billed* call is awaited before we respond: Cloud Run may stop
  // giving this instance CPU once the response is flushed, so a pending debit is not
  // guaranteed to run. Free/failed calls stay fire-and-forget — losing one costs a
  // data point, not revenue.
  const billedUsd =
    !errorCode && status < 400 ? computeBilledUsd(agent.pricingModel, agent.unitPriceUsd) : 0;
  const meter = {
    apiKeyId: keyRecord.id,
    userId: keyRecord.userId,
    agentId: agent.id,
    protocol: "A2A" as const,
    status,
    latencyMs,
    taskState,
    errorCode,
    billedUsd,
  };
  if (billedUsd > 0) {
    await debitInvocation(meter);
  } else {
    void meterInvocation(meter);
  }

  if (unreachable) {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
  return NextResponse.json(upstream, { status });
}
