// MCP tool definitions for the TakoAPI server — a thin facade over TakoAPI's
// OWN public REST/gateway API. Kept transport-agnostic so the hand-rolled
// JSON-RPC route (src/app/mcp/route.ts) — or a future SDK transport — can reuse
// them unchanged.
//
// SECURITY: the origin these tools call is a SERVER-SIDE CONSTANT. It is NEVER
// derived from an incoming request header (Host/X-Forwarded-Host), which would
// be an SSRF / self-loopback-injection vector.
import { SITE_URL } from "@/lib/seo";

export const TAKOAPI_ORIGIN = (process.env.TAKOAPI_MCP_ORIGIN || SITE_URL).replace(/\/$/, "");

export type ToolContext = { token?: string };

export type McpTool = {
  name: string;
  description: string;
  /** JSON Schema (object) describing the tool input — advertised in tools/list. */
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  invoke: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
};

/** Runtime/upstream failure — surfaced to the model as an `isError` tool result. */
export class ToolError extends Error {}

// ---- helpers ---------------------------------------------------------------
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${TAKOAPI_ORIGIN}${path}`, {
    headers: { accept: "application/json" },
  }).catch((e) => {
    throw new ToolError(`Could not reach TakoAPI (${TAKOAPI_ORIGIN}): ${String(e)}`);
  });
  const body = await res.text();
  if (!res.ok) throw new ToolError(`TakoAPI ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// ---- tools -----------------------------------------------------------------
export const TOOLS: McpTool[] = [
  {
    name: "search_agents",
    description:
      "Search the TakoAPI registry of invokable AI agents by keyword, category, or protocol. Returns matching agents with their slug, description, protocols, and pricing.",
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Free-text search term (matches name & description)." },
        category: { type: "string", description: "Filter by category slug." },
        protocol: { type: "string", enum: ["A2A", "OPENAI_COMPAT", "MCP"], description: "Filter by protocol." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max results (default 10)." },
      },
    },
    async invoke(args) {
      const limit = clampInt(args.limit, 10, 1, 50);
      const path = `/api/registry${qs({
        format: "json",
        q: str(args.query),
        category: str(args.category),
        protocol: str(args.protocol),
        limit,
      })}`;
      const data = (await getJson(path)) as { agents?: unknown[] };
      const agents = Array.isArray(data.agents) ? data.agents.slice(0, limit) : [];
      if (!agents.length) return "No agents found.";
      return JSON.stringify(agents, null, 2);
    },
  },
  {
    name: "get_agent",
    description:
      "Get full details for one TakoAPI agent by slug — capabilities, protocols, endpoint, pricing, and advertised skills.",
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { slug: { type: "string", description: "The agent's slug (from search_agents)." } },
      required: ["slug"],
    },
    async invoke(args) {
      const slug = str(args.slug);
      if (!slug) throw new ToolError("`slug` is required.");
      try {
        const data = await getJson(`/api/agents/${encodeURIComponent(slug)}`);
        return JSON.stringify(data, null, 2);
      } catch (e) {
        if (e instanceof ToolError && /HTTP 404/.test(e.message)) {
          return `No agent found with slug "${slug}".`;
        }
        throw e;
      }
    },
  },
  {
    name: "search_skills",
    description:
      "Search the OpenClaw skills catalog for coding agents. With a query, full-text searches all skills; without one, returns curated top skills.",
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Free-text search term." },
        category: { type: "string", description: "Filter by category slug." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max results (default 10)." },
      },
    },
    async invoke(args) {
      const limit = clampInt(args.limit, 10, 1, 50);
      const query = str(args.query);
      if (query) {
        const data = (await getJson(
          `/api/skills/search${qs({ q: query, category: str(args.category), limit })}`,
        )) as { skills?: unknown[] };
        const skills = Array.isArray(data.skills) ? data.skills.slice(0, limit) : [];
        return skills.length ? JSON.stringify(skills, null, 2) : `No skills found for "${query}".`;
      }
      const data = await getJson(`/api/agent${qs({ format: "json" })}`);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: "invoke_agent",
    description:
      "Invoke a TakoAPI agent through the unified gateway and return its reply. Requires the user's TakoAPI API key (sent as a Bearer token when registering this MCP server). Spends metered credits.",
    // Not read-only: it calls an external agent and may incur cost — clients should confirm.
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        slug: { type: "string", description: "The agent's slug (from search_agents)." },
        text: { type: "string", description: "The message/prompt to send the agent." },
      },
      required: ["slug", "text"],
    },
    async invoke(args, ctx) {
      const slug = str(args.slug);
      const text = str(args.text);
      if (!slug || !text) throw new ToolError("`slug` and `text` are both required.");
      if (!ctx.token) {
        throw new ToolError(
          `invoke_agent needs your TakoAPI key. Register this server with a header "Authorization: Bearer <TAKO_KEY>" — create a key at ${TAKOAPI_ORIGIN}/dashboard.`,
        );
      }
      const res = await fetch(`${TAKOAPI_ORIGIN}/v1/agents/${encodeURIComponent(slug)}/message`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${ctx.token}` },
        body: JSON.stringify({ text }),
      }).catch((e) => {
        throw new ToolError(`Could not reach the TakoAPI gateway: ${String(e)}`);
      });
      const body = await res.text();
      if (res.status === 401) {
        throw new ToolError(`TakoAPI rejected the key (401). Create or copy a valid key at ${TAKOAPI_ORIGIN}/dashboard.`);
      }
      if (!res.ok) throw new ToolError(`Gateway → HTTP ${res.status}: ${body.slice(0, 300)}`);
      return body;
    },
  },
];
