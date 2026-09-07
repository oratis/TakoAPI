import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PricingModel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, gatewayRateLimit, newRpcId } from "@/lib/apikey";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { logGatewayRejection } from "@/lib/gatewayLog";
import {
  checkCreditPreflight,
  computeBilledUsd,
  debitInvocation,
  meterInvocation,
  settleInvocation,
  startInvocation,
} from "@/lib/billing";

// OpenAI-compatible shim: point any OpenAI SDK at this base URL and set
// `model` to an agent slug. Low-friction on-ramp to the gateway.
// See docs/agent-marketplace/01-landscape-and-standards.md (lingua franca).
const TIMEOUT_MS = 30_000;
// A stream is bounded by the length of the agent's answer rather than by one
// round-trip, so it gets the same longer budget as /v1/agents/[slug]/stream.
const STREAM_TIMEOUT_MS = 120_000;
const ROUTE = "/v1/chat/completions";

// Token counts are not measured anywhere in this gateway — A2A carries none, and the
// upstream agent is free to be something other than an LLM. Reporting zeros keeps the
// field SDKs and cost dashboards expect present without inventing numbers for it.
const ZERO_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } as const;

// OpenAI accepts `content` as a plain string or as an array of typed parts. We read the
// text of each; there is no transport here for image/audio parts, so they contribute
// nothing rather than failing the request.
const contentPartSchema = z.object({ text: z.string().optional() });

const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.string().min(1),
        content: z.union([z.string(), z.array(contentPartSchema)]).nullish(),
      })
    )
    .min(1),
  stream: z.boolean().optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).nullish(),
});

type ChatMessage = z.infer<typeof chatCompletionSchema>["messages"][number];

/** OpenAI's error envelope. `param`/`code` are always present in its real responses. */
function openaiError(
  message: string,
  type: string,
  status: number,
  extra: { param?: string | null; code?: string | null } = {}
) {
  return NextResponse.json(
    { error: { message, type, param: extra.param ?? null, code: extra.code ?? null } },
    { status }
  );
}

function invalidRequest(message: string, param: string | null = null) {
  return openaiError(message, "invalid_request_error", 400, { param });
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** Concatenated text of an A2A `parts[]`; non-text parts (file, data) contribute nothing. */
function partsText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const part of parts) {
    const text = obj(part)?.text;
    if (typeof text === "string") out += text;
  }
  return out;
}

/** Text of one OpenAI message, whichever of the two `content` shapes it used. */
function messageText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part.text ?? "").join("");
}

/**
 * The whole conversation as A2A parts, one part per turn, in order.
 *
 * A2A sends a single Message per request and its `role` is limited to user|agent, so the
 * per-turn OpenAI role rides on the part's `metadata` (which the spec leaves open) rather
 * than being dropped. Agents that ignore part metadata still receive every turn in order
 * — previously only the last user line was forwarded, which silently discarded the system
 * prompt and all history, so multi-turn callers got an agent with amnesia.
 */
function toA2AParts(messages: ChatMessage[]) {
  return messages
    .map((m) => ({ kind: "text" as const, text: messageText(m.content), metadata: { role: m.role } }))
    .filter((part) => part.text.length > 0);
}

/** Answer text of a non-streamed A2A `message/send` result, whichever shape it came back in. */
function extractText(result: Record<string, unknown> | undefined): string {
  if (!result) return "";
  const artifacts = result.artifacts;
  if (Array.isArray(artifacts) && artifacts.length > 0) {
    return artifacts.map((artifact) => partsText(obj(artifact)?.parts)).join("");
  }
  return (
    partsText(result.parts) ||
    partsText(obj(result.message)?.parts) ||
    partsText(obj(obj(result.status)?.message)?.parts)
  );
}

type StreamEvent = { delta: string; state: string | null; rpcError: boolean };

/**
 * Text an A2A stream event contributes to the completion.
 *
 * Task snapshots (`kind: "task"`) repeat what the incremental events already carried, so
 * only their status message is taken — emitting their artifacts too would send the answer
 * twice. A `message` event echoing our own turn back is likewise not part of the answer.
 */
function eventDelta(result: Record<string, unknown>): string {
  switch (result.kind) {
    case "artifact-update":
      return partsText(obj(result.artifact)?.parts);
    case "status-update":
    case "task":
      return partsText(obj(obj(result.status)?.message)?.parts);
    case "message":
      return result.role === "user" ? "" : partsText(result.parts);
    default:
      return partsText(result.parts) || partsText(obj(result.message)?.parts);
  }
}

/**
 * One SSE event block (everything between two blank lines) → what it means for us.
 * Returns null for anything we cannot use: comments, keep-alives, unparseable payloads.
 */
function parseEvent(raw: string): StreamEvent | null {
  const data = raw
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, "")) // SSE strips one space after the colon
    .join("\n");
  if (!data || data === "[DONE]") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const envelope = obj(parsed);
  if (!envelope) return null;
  const result = obj(envelope.result);
  if (!result) {
    // A JSON-RPC error frame: the agent failed mid-stream even though the HTTP response
    // was 200. Surfacing it matters for billing — see the settle() call on `rpcError`.
    return envelope.error ? { delta: "", state: null, rpcError: true } : null;
  }
  const state = obj(result.status)?.state;
  return {
    delta: eventDelta(result),
    state: typeof state === "string" ? state : null,
    rpcError: false,
  };
}

// SSE separates events with a blank line, which may use any of the three line endings.
const EVENT_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;

type GatewayContext = {
  slug: string;
  message: Record<string, unknown>;
  agent: { id: string; endpointUrl: string; pricingModel: PricingModel; unitPriceUsd: unknown };
  apiKeyId: string;
  userId: string;
};

/**
 * `stream: true` → relay the agent's A2A `message/stream` SSE as OpenAI
 * `chat.completion.chunk` frames, terminated by `data: [DONE]`.
 *
 * Billing follows the same discipline as /v1/agents/[slug]/stream: the Invocation row is
 * opened unpriced before any byte is relayed (so a stream that dies still lands in the
 * denominator) and priced only when the relay reaches the end of the upstream stream over
 * a non-error response. An aborted, disconnected or JSON-RPC-failed stream costs nothing.
 */
async function streamCompletion(ctx: GatewayContext, includeUsage: boolean): Promise<Response> {
  const rpc = {
    jsonrpc: "2.0",
    id: newRpcId(),
    method: "message/stream",
    params: { message: ctx.message },
  };

  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), STREAM_TIMEOUT_MS);
  const meterBase = {
    apiKeyId: ctx.apiKeyId,
    userId: ctx.userId,
    agentId: ctx.agent.id,
    protocol: "OPENAI_COMPAT" as const,
  };

  let upstream: Response;
  try {
    upstream = await fetch(ctx.agent.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(rpc),
      signal: abort.signal,
    });
  } catch {
    clearTimeout(timer);
    void meterInvocation({
      ...meterBase,
      status: 502,
      latencyMs: Date.now() - started,
      errorCode: "UPSTREAM_UNREACHABLE",
      billedUsd: 0,
    });
    return openaiError("Agent unreachable", "upstream_error", 502);
  }

  // An OpenAI client cannot read an error out of a stream it never gets, so a failed or
  // bodiless upstream is answered as a normal error response and billed nothing.
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    upstream.body?.cancel().catch(() => {});
    void meterInvocation({
      ...meterBase,
      status: upstream.ok ? 502 : upstream.status,
      latencyMs: Date.now() - started,
      errorCode: upstream.ok ? "NO_STREAM_BODY" : "UPSTREAM_ERROR",
      billedUsd: 0,
    });
    return openaiError(
      upstream.ok ? "Agent did not return a stream" : "Agent returned an error",
      "upstream_error",
      502
    );
  }

  // An agent that does not implement `message/stream` answers HTTP 200 with a plain
  // JSON-RPC body. That is ok + non-null body, so the guard above passes; it carries
  // no `data:` lines and no blank-line boundary, so `parseEvent` never runs and the
  // relay reached `done` with rpcError === false — handing the caller a well-formed
  // but empty completion and charging the full unit price for it. Require the
  // declared content type instead.
  const upstreamType = upstream.headers.get("content-type") ?? "";
  if (!upstreamType.toLowerCase().includes("text/event-stream")) {
    clearTimeout(timer);
    upstream.body.cancel().catch(() => {});
    void meterInvocation({
      ...meterBase,
      status: 502,
      latencyMs: Date.now() - started,
      errorCode: "UPSTREAM_BAD_RESPONSE",
      billedUsd: 0,
    });
    return openaiError("Agent did not return a stream", "upstream_error", 502);
  }

  const invocationId = await startInvocation({
    ...meterBase,
    status: upstream.status,
    latencyMs: Date.now() - started,
    billedUsd: 0,
  });

  let settled = false;
  let taskState: string | null = null;
  const settle = async (status: number, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Only a stream that ran to completion over a non-error response is billable.
    const billedUsd =
      !errorCode && status < 400
        ? computeBilledUsd(ctx.agent.pricingModel, ctx.agent.unitPriceUsd)
        : 0;
    await settleInvocation(invocationId, {
      ...meterBase,
      status,
      latencyMs: Date.now() - started,
      taskState,
      errorCode,
      billedUsd,
    });
  };

  // `id` and `created` are fixed for the life of the completion, as OpenAI's are.
  const completionId = `chatcmpl_${newRpcId()}`;
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const frame = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  const chunk = (delta: Record<string, string>, finishReason: string | null) => ({
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model: ctx.slug,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rpcError = false;
  // An upstream that declares text/event-stream and then closes without ever
  // emitting a parseable event delivered nothing. Billing keys off this so an
  // empty 200 body cannot be scored as a successful call.
  let sawEvent = false;

  const out = new ReadableStream<Uint8Array>({
    start(controller) {
      // OpenAI's first chunk announces the role; content deltas follow.
      controller.enqueue(frame(chunk({ role: "assistant" }, null)));
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(timer);
          if (rpcError) {
            // The OpenAI SDKs raise on a `data:` frame carrying an `error` key, which is
            // the only way to report a mid-stream failure once headers are flushed.
            controller.enqueue(
              frame({ error: { message: "Agent returned an error", type: "upstream_error" } })
            );
          } else {
            controller.enqueue(frame(chunk({}, "stop")));
            if (includeUsage) {
              // OpenAI sends usage in a trailing choice-less chunk, and only on request.
              controller.enqueue(
                frame({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: ctx.slug,
                  choices: [],
                  usage: ZERO_USAGE,
                })
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          // Settle BEFORE closing. `controller.close()` ends the HTTP response, and
          // Cloud Run may stop giving this instance CPU the moment it does, so a
          // debit awaited afterwards is the same fire-and-forget hazard this branch
          // removed everywhere else — it would lose the charge silently, leaving the
          // Invocation row stuck unpriced. This is the only path that charges, and
          // only when the agent did not report a failure through the stream.
          await settle(
            rpcError || !sawEvent ? 502 : upstream.status,
            rpcError ? "UPSTREAM_ERROR" : sawEvent ? null : "NO_STREAM_CONTENT"
          );
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundary = EVENT_BOUNDARY.exec(buffer);
        while (boundary) {
          const event = parseEvent(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
          if (event) {
            sawEvent = true;
            if (event.state) taskState = event.state;
            if (event.rpcError) rpcError = true;
            if (event.delta) controller.enqueue(frame(chunk({ content: event.delta }, null)));
          }
          boundary = EVENT_BOUNDARY.exec(buffer);
        }
      } catch (err) {
        // Upstream broke mid-stream, or STREAM_TIMEOUT_MS aborted it. The caller did not
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
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Default path: one A2A `message/send`, answered as a whole `chat.completion`. */
async function sendCompletion(ctx: GatewayContext): Promise<Response> {
  const rpc = {
    jsonrpc: "2.0",
    id: newRpcId(),
    method: "message/send",
    params: { message: ctx.message },
  };

  const started = Date.now();
  let status = 502;
  let errorCode: string | null = null;
  let taskState: string | null = null;
  let replyText = "";

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ctx.agent.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(rpc),
      signal: abort.signal,
    });
    status = res.status;
    const envelope = obj(await res.json().catch(() => null));
    const result = obj(envelope?.result);
    if (!envelope) {
      // No parseable JSON-RPC envelope at all: the agent sent HTML, an empty body,
      // or the 30-second abort landed while the body was being read. `res.json()`
      // rejects and the catch below swallows it, so without this branch `status`
      // stayed 200, `errorCode` stayed null, and the caller was charged full price
      // for an empty completion — the timeout case being the worst, since a client
      // that retries drains its balance.
      status = 502;
      errorCode = abort.signal.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_BAD_RESPONSE";
    } else if (!result) {
      // A JSON-RPC response carrying no `result` is a failure however it is dressed:
      // an `error` envelope, a bare `{"result":null}`, or a proxy's own
      // `{"status":"ok"}`. Keying this branch on `envelope.error` caught only the
      // first shape and let every other one through as a success — HTTP 200,
      // finish_reason "stop", empty content, and charged full price. Same class of
      // loss as the `!envelope` branch above.
      status = 502;
      errorCode = envelope.error ? "UPSTREAM_ERROR" : "UPSTREAM_BAD_RESPONSE";
    } else {
      const state = obj(result?.status)?.state;
      if (typeof state === "string") taskState = state;
      replyText = extractText(result);
    }
  } catch {
    errorCode = "UPSTREAM_UNREACHABLE";
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;

  // Billed calls are awaited before responding — see debitInvocation() for why a
  // fire-and-forget debit is not guaranteed to run on Cloud Run.
  const billedUsd =
    !errorCode && status < 400
      ? computeBilledUsd(ctx.agent.pricingModel, ctx.agent.unitPriceUsd)
      : 0;
  const meter = {
    apiKeyId: ctx.apiKeyId,
    userId: ctx.userId,
    agentId: ctx.agent.id,
    protocol: "OPENAI_COMPAT" as const,
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

  // `|| status >= 400`: an upstream 4xx/5xx whose body happened to parse as a result
  // envelope used to be relayed to the caller as HTTP 200 with an empty completion,
  // swallowing the real status. The sibling A2A route forwards the upstream status
  // (agents/[slug]/message/route.ts), and this one now fails closed too.
  if (errorCode || status >= 400) {
    return openaiError(
      errorCode === "UPSTREAM_UNREACHABLE" || errorCode === "UPSTREAM_TIMEOUT"
        ? "Agent unreachable"
        : "Agent returned an error",
      "upstream_error",
      502
    );
  }

  return NextResponse.json({
    id: `chatcmpl_${newRpcId()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: ctx.slug,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: replyText },
        logprobs: null,
        finish_reason: "stop",
      },
    ],
    usage: ZERO_USAGE,
  });
}

export async function POST(req: NextRequest) {
  const keyRecord = await authenticateApiKey(
    req.headers.get("authorization") || req.headers.get("x-api-key")
  );
  if (!keyRecord) {
    logGatewayRejection({ route: ROUTE, reason: "unauthenticated", status: 401 });
    return openaiError("Invalid or missing API key", "authentication_error", 401);
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
    });
    return rateLimitResponse(rl.retryAfterMs);
  }

  const raw = await req.json().catch(() => null);
  const parsed = chatCompletionSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const param = issue.path.join(".");
    return invalidRequest(
      param ? `Invalid value for '${param}': ${issue.message}` : issue.message,
      param || null
    );
  }
  const { model: slug, messages, stream } = parsed.data;

  const parts = toA2AParts(messages);
  // Reject here rather than at the upstream: a request whose every turn is empty has
  // nothing to ask the agent, and asking anyway would bill the caller for it.
  if (parts.length === 0) {
    return invalidRequest("No message content to send to the agent", "messages");
  }

  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true, endpointUrl: true, pricingModel: true, unitPriceUsd: true },
  });
  if (!agent) {
    return openaiError(`Unknown agent '${slug}'`, "invalid_request_error", 404, { param: "model" });
  }
  if (!agent.endpointUrl) {
    return openaiError(
      `'${slug}' is an open-source project, not an invokable agent`,
      "invalid_request_error",
      400,
      { param: "model" }
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
    return openaiError(
      `Insufficient credit: '${slug}' costs $${credit.requiredUsd} per call but your balance is $${credit.balanceUsd}. Add credit to continue.`,
      "insufficient_quota",
      402,
      { code: "insufficient_quota" }
    );
  }

  const ctx: GatewayContext = {
    slug,
    // A2A requires a client-generated id on every Message; `kind` is its discriminator.
    message: { kind: "message", messageId: newRpcId(), role: "user", parts },
    agent: { ...agent, endpointUrl: agent.endpointUrl },
    apiKeyId: keyRecord.id,
    userId: keyRecord.userId,
  };

  return stream
    ? streamCompletion(ctx, parsed.data.stream_options?.include_usage === true)
    : sendCompletion(ctx);
}
