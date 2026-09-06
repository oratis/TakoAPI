import type { CodeSample } from "@/components/ui/CodeTabs";
import { SITE_URL } from "@/lib/seo";

// Structure and literal API surface for the /docs reference page.
//
// The split is deliberate: every string in this file is a *wire* value — a path,
// a query-parameter name, a status code, a request or response body — and must
// read identically in every locale, so none of it is translated. Human prose is
// referenced by message key (`*Key` fields) and resolved in the page against the
// `Docs` namespace.
//
// Everything here is transcribed from the routes it documents (src/app/api/**,
// src/app/v1/**, src/app/mcp) rather than from a spec, because there is no spec:
// the routes are the contract. When one of them changes, this file is the thing
// that goes stale, so keep the two edited together.

/** Section order — drives both the table of contents and the page body. */
export const DOCS_SECTIONS = [
  "quickstart",
  "authentication",
  "discovery",
  "gateway",
  "mcp",
  "errors",
  "limits",
] as const;

export type DocsSectionId = (typeof DOCS_SECTIONS)[number];

/**
 * Placeholder slug used across the samples. Deliberately not a real agent: the
 * page is statically rendered, and hard-coding a live slug would leave the docs
 * pointing at an agent that can be renamed, unpublished or rejected later.
 */
export const EXAMPLE_AGENT_SLUG = "<agent-slug>";

export type EndpointParam = {
  name: string;
  /** Allowed values / default, as they appear on the wire. */
  type: string;
  descKey: string;
};

export type Endpoint = {
  /** Anchor fragment and DOM id. */
  id: string;
  method: "GET" | "POST";
  path: string;
  summaryKey: string;
  /** Needs an API key. */
  auth: boolean;
  /** Debits prepaid credit when the agent is priced. */
  billable: boolean;
  params?: EndpointParam[];
  /** Literal request body, for the gateway endpoints. */
  request?: string;
  /** A copy-pasteable call. */
  example: string;
  response: string;
  /** Caveat rendered under the response — plain text, no markup. */
  noteKey?: string;
  /** Extra labelled code blocks (streaming variants, alternate body shapes). */
  extras?: Array<{ titleKey: string; code: string }>;
};

export const DISCOVERY_ENDPOINTS: Endpoint[] = [
  {
    id: "registry",
    method: "GET",
    path: "/api/registry",
    summaryKey: "endpointRegistrySummary",
    auth: false,
    billable: false,
    params: [
      { name: "format", type: "md | json", descKey: "paramRegistryFormat" },
      { name: "q", type: "string", descKey: "paramRegistryQ" },
      { name: "category", type: "slug", descKey: "paramRegistryCategory" },
      { name: "protocol", type: "A2A | OPENAI_COMPAT | MCP", descKey: "paramRegistryProtocol" },
      { name: "kind", type: "HOSTED | PROJECT", descKey: "paramRegistryKind" },
      { name: "sort", type: "stars | calls | rating", descKey: "paramRegistrySort" },
      { name: "limit", type: "int, default 200, max 1000", descKey: "paramRegistryLimit" },
    ],
    example: `curl "${SITE_URL}/api/registry?format=json&kind=HOSTED&q=research&limit=1"`,
    response: `{
  "name": "TakoAPI Agent Registry",
  "description": "One API to access all agents.",
  "note": "PROJECT entries are open-source repositories listed for discovery only: they have no TakoAPI endpoint and cannot be invoked through the gateway. Only HOSTED agents are callable.",
  "count": 1,
  "total": 47,
  "totalHosted": 47,
  "totalProject": 0,
  "returned": { "hosted": 1, "project": 0 },
  "truncated": true,
  "agents": [
    {
      "name": "Deep Research",
      "slug": "deep-research",
      "description": "Multi-step web research with cited answers.",
      "url": "${SITE_URL}/agents/deep-research",
      "kind": "HOSTED",
      "invokable": true,
      "endpoint": "https://agent.example.com/a2a",
      "github": null,
      "stars": null,
      "protocols": ["A2A", "OPENAI_COMPAT"],
      "streaming": true,
      "pricing": { "model": "PER_CALL", "unitUsd": 0.02 },
      "category": "research",
      "agentCard": "https://agent.example.com/.well-known/agent-card.json",
      "skills": [{ "id": "research", "name": "Deep research" }]
    }
  ]
}`,
    noteKey: "endpointRegistryNote",
  },
  {
    id: "agent-detail",
    method: "GET",
    path: "/api/agents/{slug}",
    summaryKey: "endpointAgentDetailSummary",
    auth: false,
    billable: false,
    params: [{ name: "slug", type: "path", descKey: "paramAgentDetailSlug" }],
    example: `curl ${SITE_URL}/api/agents/deep-research`,
    response: `{
  "id": "clx8a1b2c3d4e5f6g7h8i9j0",
  "slug": "deep-research",
  "name": "Deep Research",
  "description": "Multi-step web research with cited answers.",
  "kind": "HOSTED",
  "scenarios": ["research"],
  "cardUrl": "https://agent.example.com/.well-known/agent-card.json",
  "endpointUrl": "https://agent.example.com/a2a",
  "protocols": ["A2A", "OPENAI_COMPAT"],
  "streaming": true,
  "pushNotify": false,
  "securitySchemes": null,
  "cardSignatureVerified": false,
  "namespaceVerified": true,
  "healthStatus": "healthy",
  "healthCheckedAt": "2026-09-05T02:11:07.000Z",
  "pricingModel": "PER_CALL",
  "unitPriceUsd": 0.02,
  "byokSupported": false,
  "githubUrl": null,
  "stars": null,
  "repoOwner": null,
  "repoName": null,
  "homepage": "https://agent.example.com",
  "logo": null,
  "featured": true,
  "likesCount": 12,
  "callsCount": 3480,
  "avgRating": 4.6,
  "ratingCount": 9,
  "createdAt": "2026-04-02T09:00:00.000Z",
  "updatedAt": "2026-09-05T02:11:07.000Z",
  "category": { "name": "Research", "slug": "research" },
  "publisher": { "name": "Example Labs", "username": "example-labs" },
  "skills": [
    {
      "skillKey": "research",
      "name": "Deep research",
      "description": "Answer a question with cited sources.",
      "inputModes": ["text/plain"],
      "outputModes": ["text/plain"],
      "examples": ["Which EU AI Act obligations start in 2026?"]
    }
  ]
}`,
    noteKey: "endpointAgentDetailNote",
  },
  {
    id: "skills-directory",
    method: "GET",
    path: "/api/agent",
    summaryKey: "endpointSkillsDirectorySummary",
    auth: false,
    billable: false,
    params: [
      { name: "format", type: "md | json", descKey: "paramSkillsDirFormat" },
      { name: "q", type: "string", descKey: "paramSkillsDirQ" },
      { name: "category", type: "slug", descKey: "paramSkillsDirCategory" },
      { name: "page", type: "int, default 1", descKey: "paramSkillsDirPage" },
      { name: "limit", type: "int, default 50, max 100", descKey: "paramSkillsDirLimit" },
    ],
    example: `curl "${SITE_URL}/api/agent?format=json&q=pdf&limit=1"`,
    response: `{
  "count": 1,
  "total": 34,
  "page": 1,
  "limit": 1,
  "skills": [
    {
      "name": "PDF",
      "slug": "pdf",
      "description": "Read, fill, split and create PDF files.",
      "category": "Documents",
      "url": "${SITE_URL}/skills/pdf",
      "install": null,
      "github": "https://github.com/example/pdf-skill",
      "clawskills": "https://clawskills.sh/skills/pdf",
      "downloads": 18420,
      "stars": 240,
      "likes": 63
    }
  ]
}`,
    noteKey: "endpointSkillsDirectoryNote",
  },
  {
    id: "skills-search",
    method: "GET",
    path: "/api/skills/search",
    summaryKey: "endpointSkillsSearchSummary",
    auth: false,
    billable: false,
    params: [
      { name: "q", type: "string, required", descKey: "paramSkillsSearchQ" },
      { name: "category", type: "slug", descKey: "paramSkillsSearchCategory" },
      { name: "page", type: "int, default 1", descKey: "paramSkillsSearchPage" },
      { name: "limit", type: "int, default 24, max 100", descKey: "paramSkillsSearchLimit" },
    ],
    example: `curl "${SITE_URL}/api/skills/search?q=pdf&limit=1"`,
    response: `{
  "skills": [
    {
      "id": "clw2f9k1x0000abcd1234efgh",
      "name": "PDF",
      "slug": "pdf",
      "description": "Read, fill, split and create PDF files.",
      "author": "example",
      "githubUrl": "https://github.com/example/pdf-skill",
      "installCmd": null,
      "downloads": 18420,
      "stars": 240,
      "likesCount": 63,
      "avgRating": 4.7,
      "ratingCount": 21,
      "status": "APPROVED",
      "category": { "name": "Documents", "slug": "documents" }
    }
  ],
  "pagination": { "page": 1, "limit": 1, "total": 34, "totalPages": 34 }
}`,
    noteKey: "endpointSkillsSearchNote",
  },
];

export const GATEWAY_ENDPOINTS: Endpoint[] = [
  {
    id: "chat-completions",
    method: "POST",
    path: "/v1/chat/completions",
    summaryKey: "endpointChatCompletionsSummary",
    auth: true,
    billable: true,
    request: `{
  "model": "${EXAMPLE_AGENT_SLUG}",
  "messages": [
    { "role": "system", "content": "Answer with citations." },
    { "role": "user", "content": "Which EU AI Act obligations start in 2026?" }
  ],
  "stream": false
}`,
    example: `curl ${SITE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${EXAMPLE_AGENT_SLUG}","messages":[{"role":"user","content":"Hello"}]}'`,
    response: `{
  "id": "chatcmpl_5f0d1c8e-9a3b-4c11-8f2e-6b7a0d4e1c93",
  "object": "chat.completion",
  "created": 1789084800,
  "model": "${EXAMPLE_AGENT_SLUG}",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "The general-purpose AI obligations…" },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}`,
    extras: [
      {
        titleKey: "labelStreaming",
        code: `data: {"id":"chatcmpl_5f0d1c8e","object":"chat.completion.chunk","created":1789084800,"model":"${EXAMPLE_AGENT_SLUG}","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl_5f0d1c8e","object":"chat.completion.chunk","created":1789084800,"model":"${EXAMPLE_AGENT_SLUG}","choices":[{"index":0,"delta":{"content":"The general-purpose AI"},"finish_reason":null}]}

data: {"id":"chatcmpl_5f0d1c8e","object":"chat.completion.chunk","created":1789084800,"model":"${EXAMPLE_AGENT_SLUG}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]`,
      },
    ],
    noteKey: "endpointChatCompletionsNote",
  },
  {
    id: "a2a-message",
    method: "POST",
    path: "/v1/agents/{slug}/message",
    summaryKey: "endpointA2AMessageSummary",
    auth: true,
    billable: true,
    request: `{ "text": "Which EU AI Act obligations start in 2026?" }`,
    example: `curl ${SITE_URL}/v1/agents/${EXAMPLE_AGENT_SLUG}/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello"}'`,
    response: `{
  "jsonrpc": "2.0",
  "id": "5f0d1c8e-9a3b-4c11-8f2e-6b7a0d4e1c93",
  "result": {
    "kind": "task",
    "status": { "state": "completed" },
    "artifacts": [
      { "parts": [{ "kind": "text", "text": "The general-purpose AI obligations…" }] }
    ]
  }
}`,
    extras: [
      {
        titleKey: "labelA2AMessageForm",
        code: `{
  "message": {
    "role": "user",
    "parts": [{ "kind": "text", "text": "And what about GPAI models?" }],
    "taskId": "3c9a1f70-1d2b-4e55-9a01-77c0f2b6d8e4"
  },
  "contextId": "c0ffee00-1111-2222-3333-444455556666"
}`,
      },
    ],
    noteKey: "endpointA2AMessageNote",
  },
  {
    id: "a2a-stream",
    method: "POST",
    path: "/v1/agents/{slug}/stream",
    summaryKey: "endpointA2AStreamSummary",
    auth: true,
    billable: true,
    request: `{ "text": "Which EU AI Act obligations start in 2026?" }`,
    example: `curl -N ${SITE_URL}/v1/agents/${EXAMPLE_AGENT_SLUG}/stream \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello"}'`,
    response: `HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform

data: {"jsonrpc":"2.0","id":"5f0d1c8e","result":{"kind":"status-update","status":{"state":"working"}}}

data: {"jsonrpc":"2.0","id":"5f0d1c8e","result":{"kind":"artifact-update","artifact":{"parts":[{"kind":"text","text":"The general-purpose AI"}]}}}

data: {"jsonrpc":"2.0","id":"5f0d1c8e","result":{"kind":"status-update","final":true,"status":{"state":"completed"}}}`,
    noteKey: "endpointA2AStreamNote",
  },
];

export type ErrorRow = {
  status: number;
  /** Machine-readable code, where the route emits one. */
  code: string;
  whenKey: string;
  body: string;
};

// Only statuses the gateway itself produces. A status the agent returned is
// relayed untouched by /v1/agents/{slug}/message, so it is not listed here.
export const ERROR_ROWS: ErrorRow[] = [
  {
    status: 400,
    code: "invalid_request_error",
    whenKey: "error400When",
    body: `{ "error": "This agent is an open-source project, not an invokable endpoint" }`,
  },
  {
    status: 401,
    code: "authentication_error",
    whenKey: "error401When",
    body: `{ "error": "Invalid or missing API key" }`,
  },
  {
    status: 402,
    code: "insufficient_quota",
    whenKey: "error402When",
    body: `{
  "error": "Insufficient credit",
  "detail": "This agent costs $0.02 per call; your balance is $0.004. Add credit to continue.",
  "balanceUsd": 0.004,
  "requiredUsd": 0.02
}`,
  },
  {
    status: 404,
    code: "NOT_FOUND",
    whenKey: "error404When",
    body: `{ "error": "Agent not found" }`,
  },
  {
    status: 429,
    code: "Retry-After",
    whenKey: "error429When",
    body: `{ "error": "Too many requests" }`,
  },
  {
    status: 502,
    code: "upstream_error",
    whenKey: "error502When",
    body: `{ "error": "Agent unreachable" }`,
  },
];

/** The OpenAI-compat route wraps the same failures in OpenAI's error envelope. */
export const OPENAI_ERROR_SAMPLE = `{
  "error": {
    "message": "Insufficient credit: '${EXAMPLE_AGENT_SLUG}' costs $0.02 per call but your balance is $0.004. Add credit to continue.",
    "type": "insufficient_quota",
    "param": null,
    "code": "insufficient_quota"
  }
}`;

export const MCP_URL = `${SITE_URL}/mcp`;

/** The three supported clients, in the same order as the /install page. */
export function mcpRegisterSamples(): CodeSample[] {
  return [
    {
      key: "claude",
      label: "Claude Code",
      code: `claude mcp add --transport http takoapi ${MCP_URL}

# With a key, so invoke_agent works too:
claude mcp add --transport http takoapi ${MCP_URL} \\
  --header "Authorization: Bearer $TAKO_KEY"`,
    },
    {
      key: "codex",
      label: "Codex",
      code: `# ~/.codex/config.toml
[mcp_servers.takoapi]
url = "${MCP_URL}"
bearer_token_env_var = "TAKO_KEY"`,
    },
    {
      key: "opencode",
      label: "OpenCode",
      code: `// ~/.config/opencode/opencode.json
{
  "mcp": {
    "takoapi": {
      "type": "remote",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer YOUR_TAKO_KEY" }
    }
  }
}`,
    },
  ];
}

export type McpToolDoc = { name: string; auth: boolean; descKey: string };

export const MCP_TOOLS: McpToolDoc[] = [
  { name: "search_agents", auth: false, descKey: "mcpToolSearchAgents" },
  { name: "get_agent", auth: false, descKey: "mcpToolGetAgent" },
  { name: "search_skills", auth: false, descKey: "mcpToolSearchSkills" },
  { name: "invoke_agent", auth: true, descKey: "mcpToolInvokeAgent" },
];

/** Authentication header, shown once and referenced from the quickstart. */
export const AUTH_HEADER_SAMPLE = `curl ${SITE_URL}/api/registry?format=json

# Discovery needs no key. The gateway does:
curl ${SITE_URL}/v1/agents/${EXAMPLE_AGENT_SLUG}/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"text":"Hello"}'

# x-api-key is accepted as an alternative:
curl ${SITE_URL}/v1/agents/${EXAMPLE_AGENT_SLUG}/message \\
  -H "x-api-key: $TAKO_KEY" \\
  -d '{"text":"Hello"}'`;

export const EXPORT_KEY_SAMPLE = `export TAKO_KEY="tako_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`;

export const RATE_LIMIT_SAMPLE = `HTTP/1.1 429 Too Many Requests
Retry-After: 42

{ "error": "Too many requests" }`;
