// TakoAPI MCP server — a hand-rolled, zero-dependency, STATELESS implementation
// of the Model Context Protocol Streamable-HTTP transport. Because the server
// never initiates messages, every JSON-RPC request is answered with a single
// `application/json` response (no SSE, no session id) — which is spec-valid and
// matches this repo's existing /v1 JSON-RPC route style.
//
// Endpoint: https://takoapi.com/mcp   ·   register with, e.g.:
//   claude mcp add --transport http takoapi https://takoapi.com/mcp
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { logGatewayRejection } from "@/lib/gatewayLog";
import { TOOLS, ToolError, TAKOAPI_ORIGIN, type ToolContext } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_INFO = { name: "takoapi", version: "0.1.0" };
const LATEST_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);

type JsonRpcId = string | number | null;

function result(id: JsonRpcId, value: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result: value });
}
function rpcError(id: JsonRpcId, code: number, message: string, httpStatus = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: httpStatus });
}

function bearerToken(req: NextRequest): string | undefined {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() || undefined : undefined;
}

// Lightweight JSON-Schema validation for the tool input shapes we define
// (string/integer/enum + required). Returns an error message, or null if valid.
function validateArgs(schema: Record<string, unknown>, args: Record<string, unknown>): string | null {
  const required = (schema.required as string[] | undefined) ?? [];
  for (const key of required) {
    const v = args[key];
    if (v === undefined || v === null || v === "") return `Missing required parameter: ${key}`;
  }
  const props = (schema.properties as Record<string, { type?: string; enum?: string[] }> | undefined) ?? {};
  for (const [key, spec] of Object.entries(props)) {
    const v = args[key];
    if (v === undefined) continue;
    if (spec.type === "string" && typeof v !== "string") return `Parameter "${key}" must be a string`;
    if (spec.type === "integer" && typeof v !== "number") return `Parameter "${key}" must be a number`;
    if (spec.enum && !spec.enum.includes(v as string)) {
      return `Parameter "${key}" must be one of: ${spec.enum.join(", ")}`;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  // Per-IP guard for the (partly anonymous) endpoint. Reuses the gateway limiter.
  // Stays per-IP: unlike /v1 there is no API key here to bucket by.
  const rl = await checkRateLimit(req, { key: "mcp", windowMs: 60_000, max: 120 });
  if (!rl.ok) {
    logGatewayRejection({ route: "/mcp", reason: "rate_limited", status: 429 });
    return rateLimitResponse(rl.retryAfterMs);
  }

  let msg: { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  // Batch requests aren't supported by this stateless server.
  if (Array.isArray(msg)) return rpcError(null, -32600, "Batched requests are not supported", 400);

  const { id, method, params } = msg ?? {};

  // Notifications carry no id (e.g. notifications/initialized) — ack with 202, no body.
  if (id === undefined || id === null) {
    return new NextResponse(null, { status: 202 });
  }

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion as string | undefined;
      const protocolVersion = requested && KNOWN_PROTOCOLS.has(requested) ? requested : LATEST_PROTOCOL;
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "TakoAPI — discover and invoke AI agents and search the OpenClaw skills catalog. " +
          "Read tools (search_agents, get_agent, search_skills) are anonymous; invoke_agent needs " +
          "your TakoAPI key sent as an Authorization: Bearer token.",
      });
    }

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          ...(t.annotations ? { annotations: t.annotations } : {}),
        })),
      });

    case "tools/call": {
      const name = params?.name as string | undefined;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name ?? "(none)"}`);

      const args = (params?.arguments as Record<string, unknown>) ?? {};
      const invalid = validateArgs(tool.inputSchema, args);
      if (invalid) return rpcError(id, -32602, invalid);

      const ctx: ToolContext = { token: bearerToken(req) };
      try {
        const text = await tool.invoke(args, ctx);
        return result(id, { content: [{ type: "text", text }] });
      } catch (err) {
        // Tool-level failure → return as an isError result (not a protocol error),
        // so the model can read and react to the message.
        const message = err instanceof ToolError ? err.message : "Tool execution failed.";
        return result(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method ?? "(none)"}`);
  }
}

// Stateless server: there is no server→client SSE channel, so GET isn't used by
// the transport. Return a friendly hint instead of a bare 405 body.
export async function GET() {
  return NextResponse.json(
    {
      service: "takoapi-mcp",
      transport: "streamable-http",
      hint: `POST JSON-RPC to this URL. Register: claude mcp add --transport http takoapi ${TAKOAPI_ORIGIN}/mcp`,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
