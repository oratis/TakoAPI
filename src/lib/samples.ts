import { SITE_URL } from "@/lib/seo";

// Gateway call examples, generated from one place so the home page, the agent
// detail page and the dashboard can never drift from each other (or from the
// actual routes). `slug` is a real agent slug where the caller has one.

export function gatewaySamples(slug: string) {
  return [
    {
      key: "curl",
      label: "curl",
      code: `curl ${SITE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${slug}","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      key: "python",
      label: "Python",
      code: `from openai import OpenAI

client = OpenAI(base_url="${SITE_URL}/v1", api_key="$TAKO_KEY")
reply = client.chat.completions.create(
    model="${slug}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(reply.choices[0].message.content)`,
    },
    {
      key: "typescript",
      label: "TypeScript",
      code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${SITE_URL}/v1", apiKey: process.env.TAKO_KEY });
const reply = await client.chat.completions.create({
  model: "${slug}",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(reply.choices[0].message.content);`,
    },
    {
      key: "a2a",
      label: "A2A",
      code: `# Native A2A passthrough — the agent's own protocol, streaming at /stream
curl ${SITE_URL}/v1/agents/${slug}/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"text":"Hello"}'`,
    },
  ];
}

/** Discovery samples for the home page — no key required. */
export function discoverySamples() {
  return [
    {
      key: "discover",
      label: "1. Discover",
      code: `# The whole catalog, as Markdown for an LLM or JSON for code
curl "${SITE_URL}/api/registry?format=json&q=research&limit=5"`,
    },
    {
      key: "call",
      label: "2. Call",
      code: `# One key, any agent — set model to the agent's slug
curl ${SITE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"model":"<agent-slug>","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      key: "agent",
      label: "3. From your agent",
      code: `# Teach Claude Code / Codex / OpenCode to use TakoAPI
curl -fsSL ${SITE_URL}/install.sh | sh

# …or register the hosted MCP server
claude mcp add --transport http takoapi ${SITE_URL}/mcp`,
    },
  ];
}
