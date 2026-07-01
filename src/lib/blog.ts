// ─────────────────────────────────────────────────────────────
// Blog / content registry — depth content for SEO weight (GTM §5).
//
// Defined in code (not the unused `BlogPost` DB model) so posts are
// reviewable, version-controlled, and ship with the build — no migration,
// no seeding, no DB round-trip on render. Each post's `body` is trusted
// HTML authored here (NOT user input), rendered with dangerouslySetInnerHTML
// on the article page.
//
// Strategy note: these are English-first marketing/explainer pages. The
// English URLs are the canonical, indexable ones; non-English locales render
// the same English body but are emitted `noindex` (matching the near-duplicate
// defense the rest of the app already uses) so we never risk machine-translated
// thin-content penalties. To add a post: append to POSTS, keep dates ISO, and
// cross-link other posts/scenarios with absolute in-app paths.
// ─────────────────────────────────────────────────────────────

export interface BlogPost {
  /** stable slug used in the URL: /blog/<slug> */
  slug: string;
  /** <title> + H1 */
  title: string;
  /** meta description + list blurb (~150–160 chars) */
  description: string;
  /** ISO date (YYYY-MM-DD) */
  datePublished: string;
  /** ISO date (YYYY-MM-DD) */
  dateModified: string;
  /** short topic tags shown as chips */
  tags: string[];
  /** rough reading time in minutes, shown in the list/header */
  readingMinutes: number;
  /** trusted HTML body (authored here, never user input) */
  body: string;
  /** optional Q&A → FAQPage structured data + on-page FAQ */
  faq?: { q: string; a: string }[];
}

// Shared CTA appended to every article body.
const CTA = `
<aside class="not-prose my-8 rounded-xl border border-purple-200 bg-purple-50 p-5">
  <p class="font-semibold text-gray-900">Try it in 30 seconds</p>
  <p class="mt-1 text-sm text-gray-600">Discover and invoke any hosted agent through one API. Browse the open <a href="/agents">agent directory</a>, or install TakoAPI into your coding agent:</p>
  <pre class="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100"><code>curl -fsSL https://takoapi.com/install.sh | sh</code></pre>
</aside>`;

export const POSTS: BlogPost[] = [
  {
    slug: "what-is-a2a",
    title: "What is A2A (Agent2Agent)? The agent interoperability protocol, explained",
    description:
      "A2A is an open protocol that lets independent AI agents discover and talk to each other across vendors. Here's how AgentCards, tasks, and messages work — with examples.",
    datePublished: "2026-06-27",
    dateModified: "2026-06-27",
    tags: ["A2A", "protocols", "interoperability"],
    readingMinutes: 7,
    body: `
<p><strong>A2A (Agent2Agent)</strong> is an open protocol for letting independent AI agents discover one another and collaborate — even when they were built by different teams, on different frameworks, behind different clouds. Think of it as a common language two agents can speak without sharing code, memory, or a vendor.</p>

<p>It was introduced by Google in 2025 and is now stewarded as an open project. The goal is narrow and useful: give an agent a standard way to <em>find</em> another agent, <em>describe</em> what it can do, and <em>delegate</em> a unit of work to it.</p>

<h2>The problem A2A solves</h2>
<p>Most agents today are islands. A scheduling agent and a travel-booking agent might each be excellent, but to make them cooperate you write bespoke glue: custom HTTP calls, custom auth, custom payload shapes. Multiply that by every pair of agents and integration cost explodes. A2A replaces N×N bespoke integrations with one protocol every agent can implement once.</p>

<h2>The three core concepts</h2>
<h3>1. The AgentCard</h3>
<p>Every A2A agent publishes an <strong>AgentCard</strong> — a small JSON document (conventionally at <code>/.well-known/agent.json</code>) that advertises its identity, endpoint URL, supported skills, input/output modes, and authentication requirements. It's the agent's business card: another agent reads it to decide whether and how to call it. This is what makes agents <em>discoverable</em> rather than hard-coded.</p>

<h3>2. Tasks</h3>
<p>Work in A2A is modeled as a <strong>task</strong> with a lifecycle: <code>submitted → working → input-required → completed</code> (or <code>failed</code>/<code>canceled</code>). Because real agent work can take seconds or minutes, tasks are first-class and stateful — you can submit one, poll it, or stream its progress, rather than blocking on a single request/response.</p>

<h3>3. Messages and artifacts</h3>
<p>Within a task, the calling agent and the remote agent exchange <strong>messages</strong> (turns of a conversation) made of <em>parts</em> — text, files, or structured data. The remote agent's deliverables come back as <strong>artifacts</strong>. This part/artifact model is what lets A2A carry more than plain text: a document, an image, a JSON result.</p>

<h2>What a call looks like</h2>
<p>At the wire level A2A is JSON-RPC over HTTP, with Server-Sent Events for streaming. Conceptually:</p>
<ol>
  <li>Fetch the remote agent's <strong>AgentCard</strong> to learn its URL and auth.</li>
  <li>Send a <code>message/send</code> (or <code>message/stream</code>) request that opens a <strong>task</strong>.</li>
  <li>Receive streamed updates as the task moves through its states, then collect the final <strong>artifacts</strong>.</li>
</ol>

<h2>Where TakoAPI fits</h2>
<p>A2A standardizes the <em>conversation</em> between two agents, but you still have to find agents, manage an API key per agent, and handle each one's billing and uptime. <a href="/agents">TakoAPI</a> is a directory and gateway on top of A2A: every listed agent is described by its AgentCard, and you invoke any of them through one endpoint and one key — A2A passthrough, SSE streaming, or an OpenAI-compatible shim. It's the "OpenRouter for agents" layer that A2A makes possible.</p>
${CTA}
<p class="text-sm text-gray-500">Related: <a href="/blog/a2a-vs-mcp">A2A vs MCP</a> · <a href="/blog/one-api-for-all-agents">How to call multiple agents through one API</a></p>
`,
    faq: [
      {
        q: "Is A2A the same as MCP?",
        a: "No. MCP (Model Context Protocol) connects a single model to tools and data sources. A2A connects independent agents to each other. They're complementary — an agent can use MCP for its tools and A2A to delegate to other agents.",
      },
      {
        q: "Who created A2A?",
        a: "A2A (Agent2Agent) was introduced by Google in 2025 and is developed as an open protocol so any vendor or framework can implement it.",
      },
      {
        q: "What is an AgentCard?",
        a: "An AgentCard is a small JSON document an A2A agent publishes to advertise its endpoint, skills, input/output modes, and auth — the metadata other agents read to discover and call it.",
      },
    ],
  },
  {
    slug: "a2a-vs-mcp",
    title: "A2A vs MCP: how Agent2Agent and Model Context Protocol differ (and work together)",
    description:
      "A2A connects agents to other agents; MCP connects a model to tools and data. Here's a side-by-side comparison of the two protocols and when to use each.",
    datePublished: "2026-06-27",
    dateModified: "2026-06-27",
    tags: ["A2A", "MCP", "protocols"],
    readingMinutes: 6,
    body: `
<p>A2A and MCP are the two protocols you'll hear about most when building with agents, and they're constantly confused. The short version: <strong>MCP connects a model to its tools; A2A connects an agent to other agents.</strong> They operate at different layers and are designed to be used together, not chosen between.</p>

<h2>Side by side</h2>
<table>
  <thead>
    <tr><th>&nbsp;</th><th>MCP (Model Context Protocol)</th><th>A2A (Agent2Agent)</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Connects</strong></td><td>One model/agent → tools, files, data sources</td><td>One agent → other independent agents</td></tr>
    <tr><td><strong>Question it answers</strong></td><td>"What can this agent <em>do</em> / reach?"</td><td>"Who else can I <em>delegate</em> this to?"</td></tr>
    <tr><td><strong>Unit of work</strong></td><td>Tool call (function with arguments)</td><td>Task (stateful, long-running, streamable)</td></tr>
    <tr><td><strong>Discovery</strong></td><td>Server lists its tools</td><td>Agent publishes an AgentCard</td></tr>
    <tr><td><strong>Typical caller</strong></td><td>The LLM inside one agent</td><td>An agent acting as a client of another agent</td></tr>
    <tr><td><strong>Introduced by</strong></td><td>Anthropic (2024)</td><td>Google (2025)</td></tr>
  </tbody>
</table>

<h2>An analogy</h2>
<p>If an agent were a worker: <strong>MCP is the worker's toolbox</strong> — the drills, the database access, the file cabinet they reach for. <strong>A2A is the worker calling a colleague</strong> in another department to hand off a job they can't do themselves. You want both. A capable agent uses MCP to act on the world and A2A to collaborate with specialists.</p>

<h2>A concrete flow</h2>
<p>Say you ask a "trip planner" agent to book a vacation:</p>
<ol>
  <li>The planner uses <strong>MCP</strong> to call a calendar tool and a weather API (its own tools).</li>
  <li>It then uses <strong>A2A</strong> to delegate "book this flight" to a dedicated flight-booking agent and "reserve this hotel" to a hotel agent — independent agents it discovered, not tools it owns.</li>
  <li>Each delegated <strong>task</strong> streams progress back; the planner assembles the results.</li>
</ol>

<h2>When to reach for which</h2>
<ul>
  <li><strong>Use MCP</strong> when you're giving <em>one</em> agent access to tools, APIs, files, or databases.</li>
  <li><strong>Use A2A</strong> when you want <em>separate</em> agents — possibly from different vendors — to cooperate on a job.</li>
</ul>

<h2>How TakoAPI uses both</h2>
<p>TakoAPI is an A2A directory and gateway: agents are described by AgentCards and invoked over A2A through one key. It's <em>also</em> exposed as a hosted <strong>MCP server</strong>, so a coding agent can register TakoAPI once and get <code>search_agents</code>, <code>get_agent</code>, and <code>invoke_agent</code> as native tools — using MCP to reach into an A2A directory. That's the two protocols composing exactly as intended.</p>
${CTA}
<p class="text-sm text-gray-500">Related: <a href="/blog/what-is-a2a">What is A2A?</a> · <a href="/blog/takoapi-vs-openrouter">TakoAPI vs OpenRouter</a></p>
`,
    faq: [
      {
        q: "Should I use A2A or MCP?",
        a: "Usually both. Use MCP to connect one agent to its tools and data; use A2A to let that agent delegate work to other independent agents. They sit at different layers and compose.",
      },
      {
        q: "Does A2A replace MCP?",
        a: "No. They solve different problems — MCP is model-to-tools, A2A is agent-to-agent — and are designed to be used together.",
      },
    ],
  },
  {
    slug: "one-api-for-all-agents",
    title: "How to call multiple AI agents through one API",
    description:
      "Stop managing a separate SDK, key, and billing setup per agent. Here's how to discover and invoke many AI agents through a single unified API with one key.",
    datePublished: "2026-06-27",
    dateModified: "2026-06-27",
    tags: ["gateway", "API", "how-to"],
    readingMinutes: 5,
    body: `
<p>The moment you use more than one hosted agent, integration tax kicks in: a different base URL, a different auth scheme, a different request shape, and a separate invoice for each. A unified <strong>agent gateway</strong> collapses all of that into one endpoint, one key, and one bill — the same move OpenRouter made for language models, applied to agents.</p>

<h2>The pattern</h2>
<p>A gateway sits in front of many agents and gives you three things:</p>
<ul>
  <li><strong>One directory</strong> to discover agents (by capability, scenario, or popularity).</li>
  <li><strong>One credential</strong> — a single API key that works across every agent.</li>
  <li><strong>One protocol surface</strong> — call any agent the same way, with metering and billing handled centrally.</li>
</ul>

<h2>Step 1 — discover agents</h2>
<p>Ask the registry for the catalog. It returns Markdown by default (ideal to drop straight into an LLM's context) or JSON:</p>
<pre><code>curl "https://takoapi.com/api/registry?format=json&q=research"</code></pre>

<h2>Step 2 — get a key</h2>
<p>Create an API key in the <a href="/dashboard">dashboard</a>. The same key authorizes every agent; usage is metered per call so you get one consolidated bill instead of N.</p>

<h2>Step 3 — invoke any agent</h2>
<p>Call a hosted agent through the gateway. Three surfaces are available depending on your client:</p>
<pre><code># A2A passthrough
curl -X POST https://takoapi.com/v1/agents/&lt;slug&gt;/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message":{"role":"user","parts":[{"text":"Summarize this URL ..."}]}}'

# Streaming (Server-Sent Events)
curl https://takoapi.com/v1/agents/&lt;slug&gt;/stream -H "Authorization: Bearer $TAKO_KEY" ...

# OpenAI-compatible shim — point any OpenAI SDK at this base URL
curl https://takoapi.com/v1/chat/completions -H "Authorization: Bearer $TAKO_KEY" ...</code></pre>

<p>The OpenAI-compatible surface is the fastest path if you already have code using an OpenAI SDK: change the base URL and key, and you're calling agents instead of raw models — no new SDK to learn.</p>

<h2>Step 4 (optional) — let your coding agent do it</h2>
<p>If you live in Claude Code, Codex, or OpenCode, install TakoAPI as a skill or MCP server and your agent gains <code>search_agents</code> / <code>invoke_agent</code> natively:</p>
<pre><code>curl -fsSL https://takoapi.com/install.sh | sh
# or, as an MCP server:
claude mcp add --transport http takoapi https://takoapi.com/mcp</code></pre>

<h2>Why route through a gateway at all</h2>
<ul>
  <li><strong>Less code</strong> — one integration instead of one per agent.</li>
  <li><strong>One bill</strong> — metered centrally; top up once.</li>
  <li><strong>Swap freely</strong> — try a different agent for the same job by changing a slug, not rewriting an integration.</li>
</ul>
${CTA}
<p class="text-sm text-gray-500">Related: <a href="/blog/what-is-a2a">What is A2A?</a> · <a href="/blog/takoapi-vs-openrouter">TakoAPI vs OpenRouter</a></p>
`,
  },
  {
    slug: "takoapi-vs-openrouter",
    title: "TakoAPI vs OpenRouter: a gateway for agents vs a gateway for models",
    description:
      "OpenRouter gives you one API for many LLMs. TakoAPI gives you one API for many agents. Here's how the two differ and when each is the right tool.",
    datePublished: "2026-06-27",
    dateModified: "2026-06-27",
    tags: ["comparison", "gateway", "OpenRouter"],
    readingMinutes: 5,
    body: `
<p>People often describe TakoAPI as "OpenRouter for agents," which is the right instinct — both are unified gateways with one key and one bill. The difference is the <em>unit</em> they route to. <strong>OpenRouter routes to models; TakoAPI routes to agents.</strong> That distinction changes what you send, what you get back, and what the gateway does for you.</p>

<h2>Side by side</h2>
<table>
  <thead>
    <tr><th>&nbsp;</th><th>OpenRouter</th><th>TakoAPI</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Routes to</strong></td><td>Language models (GPT, Claude, Llama …)</td><td>AI agents (hosted, task-completing)</td></tr>
    <tr><td><strong>Unit of work</strong></td><td>A completion / chat turn</td><td>A task — possibly multi-step, tool-using, long-running</td></tr>
    <tr><td><strong>Native protocol</strong></td><td>OpenAI chat-completions</td><td>A2A (+ OpenAI-compatible shim + SSE)</td></tr>
    <tr><td><strong>Discovery</strong></td><td>Model list</td><td>Agent directory + open-source project directory + scenarios</td></tr>
    <tr><td><strong>Describes capability via</strong></td><td>Model name + context window</td><td>AgentCard (skills, I/O modes, auth)</td></tr>
    <tr><td><strong>Also a coding-agent tool?</strong></td><td>—</td><td>Yes — installs as a skill / MCP server</td></tr>
  </tbody>
</table>

<h2>The real distinction: model vs agent</h2>
<p>A <strong>model</strong> takes a prompt and returns text. An <strong>agent</strong> takes a goal and does work toward it — calling tools, taking multiple steps, sometimes delegating to other agents — then returns a result. OpenRouter is the right abstraction when you want to pick the best <em>model</em> for a prompt. TakoAPI is the right abstraction when you want to hand off a <em>job</em> to something that completes it.</p>

<h2>They're not mutually exclusive</h2>
<p>Many agents are built <em>on</em> models — and some of those models may be served through OpenRouter. You can use OpenRouter at the model layer inside your own agent and use TakoAPI at the agent layer to discover and invoke other agents. They sit at different altitudes of the same stack.</p>

<h2>When to choose TakoAPI</h2>
<ul>
  <li>You want to <strong>discover and call task-completing agents</strong>, not just raw models.</li>
  <li>You need <strong>A2A</strong> (AgentCards, stateful tasks, streaming) — with an OpenAI-compatible shim for drop-in use.</li>
  <li>You want your <strong>coding agent</strong> (Claude Code, Codex, OpenCode) to discover and invoke agents as a native skill or MCP tool.</li>
  <li>You want <strong>one key and one bill</strong> across many agents, metered per call.</li>
</ul>

<h2>When to choose OpenRouter</h2>
<ul>
  <li>You're routing among <strong>language models</strong> and want price/availability fallback across providers.</li>
</ul>

<p>Different layer, different job. If your question is "which model answers this prompt best," reach for a model gateway. If it's "which agent gets this task done," that's what <a href="/agents">TakoAPI</a> is for.</p>
${CTA}
<p class="text-sm text-gray-500">Related: <a href="/blog/one-api-for-all-agents">Call multiple agents through one API</a> · <a href="/blog/a2a-vs-mcp">A2A vs MCP</a></p>
`,
    faq: [
      {
        q: "Is TakoAPI just OpenRouter for agents?",
        a: "That's a good shorthand. Both are unified gateways with one key and one bill, but OpenRouter routes to language models and TakoAPI routes to task-completing agents over A2A (with an OpenAI-compatible shim).",
      },
      {
        q: "Can I use TakoAPI and OpenRouter together?",
        a: "Yes. They sit at different layers — you can use OpenRouter for model routing inside your own agent and TakoAPI to discover and invoke other agents.",
      },
    ],
  },
  {
    slug: "what-is-an-agentcard",
    title: "What is an AgentCard? The A2A agent manifest, explained",
    description:
      "An AgentCard is the JSON manifest an A2A agent publishes so other agents can discover and call it. Here's what's inside one, where it lives, and how it's used.",
    datePublished: "2026-06-27",
    dateModified: "2026-06-27",
    tags: ["A2A", "AgentCard", "interoperability"],
    readingMinutes: 5,
    body: `
<p>An <strong>AgentCard</strong> is the manifest an <a href="/blog/what-is-a2a">A2A</a> agent publishes to describe itself — the small JSON document that lets any other agent discover it, understand what it can do, and learn how to call it. If A2A is the language agents speak, the AgentCard is the business card they hand over first.</p>

<h2>Where it lives</h2>
<p>By convention an agent serves its card at a well-known path — typically <code>/.well-known/agent.json</code> on the agent's domain. A client agent fetches that URL, reads the card, and now knows everything it needs to make a call: the endpoint, the skills, the auth. No shared SDK, no out-of-band docs.</p>

<h2>What's inside</h2>
<p>The exact schema evolves with the spec, but an AgentCard consistently carries:</p>
<ul>
  <li><strong>Identity</strong> — a human-readable <code>name</code>, <code>description</code>, provider, and version.</li>
  <li><strong>Endpoint URL</strong> — the base URL a client sends A2A requests to.</li>
  <li><strong>Skills</strong> — a list of what the agent can do, each with an id, description, and example inputs/outputs. This is how a caller decides <em>whether</em> this agent is the right one for a task.</li>
  <li><strong>Input/output modes</strong> — the content types the agent accepts and returns (text, files, structured data).</li>
  <li><strong>Capabilities</strong> — flags like whether it supports streaming (SSE) or push notifications.</li>
  <li><strong>Authentication</strong> — the auth schemes required to call it (e.g. bearer token, API key), so the client knows how to present credentials.</li>
</ul>

<h2>Why it matters</h2>
<p>The AgentCard is what turns a pile of independent agents into a <em>discoverable network</em>. Because capability is declared in a machine-readable way, a client (or a directory, or an orchestrating agent) can pick the right agent for a job programmatically — the same way a service registry lets microservices find each other. Without it, every integration is hand-wired.</p>

<h2>AgentCards and directories</h2>
<p>A directory is essentially a curated collection of AgentCards. That's exactly how <a href="/agents">TakoAPI</a> works: every listed agent is described by its AgentCard, which is what lets you search across agents by capability and then invoke any of them through one gateway and one key. The card is the unit of discovery; the gateway is the unit of access.</p>
${CTA}
<p class="text-sm text-gray-500">Related: <a href="/blog/what-is-a2a">What is A2A?</a> · <a href="/blog/one-api-for-all-agents">Call multiple agents through one API</a></p>
`,
    faq: [
      {
        q: "Where is an AgentCard hosted?",
        a: "Conventionally at a well-known path on the agent's domain — typically /.well-known/agent.json — so any client can fetch it to discover the agent's endpoint, skills, and auth.",
      },
      {
        q: "What's the difference between an AgentCard and an OpenAPI spec?",
        a: "An OpenAPI spec describes a REST API's endpoints and schemas. An AgentCard describes an agent's identity, skills, I/O modes, streaming capability, and auth for the A2A protocol — it's about agent capability and discovery, not raw HTTP routes.",
      },
    ],
  },
  {
    slug: "openrouter-for-agents",
    title: "\"OpenRouter for agents\": what a unified agent gateway actually does",
    description:
      "\"OpenRouter for agents\" is shorthand for a gateway that gives you one API, one key, and one bill across many AI agents. Here's what that means and why it matters.",
    datePublished: "2026-06-27",
    dateModified: "2026-06-27",
    tags: ["gateway", "OpenRouter", "concepts"],
    readingMinutes: 5,
    body: `
<p>"OpenRouter for agents" is the fastest way to explain a unified <strong>agent gateway</strong>: just as OpenRouter gives you a single API and account across dozens of language models, an agent gateway gives you a single API, key, and bill across many <em>agents</em>. The phrase borrows a mental model people already have and points it one layer up the stack.</p>

<h2>What the analogy captures</h2>
<p>OpenRouter solved a real annoyance: every model provider has its own SDK, auth, and billing, so using several means juggling several integrations. It put one endpoint in front of all of them. An agent gateway does the same for agents — with one difference that matters (below).</p>
<ul>
  <li><strong>One endpoint</strong> — call any agent the same way instead of learning each one's API.</li>
  <li><strong>One key</strong> — a single credential authorizes every agent.</li>
  <li><strong>One bill</strong> — usage is metered centrally; top up once.</li>
  <li><strong>Easy swapping</strong> — change which agent handles a job by changing a slug, not rewriting an integration.</li>
</ul>

<h2>Where the analogy breaks: models vs agents</h2>
<p>A model takes a prompt and returns text. An <strong>agent</strong> takes a goal and does work toward it — calling tools, taking multiple steps, sometimes delegating to other agents over <a href="/blog/a2a-vs-mcp">A2A</a> — then returns a result. So an agent gateway has to handle things a model gateway doesn't: stateful, longer-running <strong>tasks</strong>; streaming progress; and richer capability discovery via <a href="/blog/what-is-an-agentcard">AgentCards</a>. It's the same convenience, but over a heavier unit of work. (For a head-to-head, see <a href="/blog/takoapi-vs-openrouter">TakoAPI vs OpenRouter</a>.)</p>

<h2>Why route through one at all</h2>
<p>The value is the same reason people adopted model gateways: less integration code, one place to manage spend, and the freedom to try a different agent for the same job without friction. As the number of useful hosted agents grows, wiring each one by hand stops scaling — a gateway is how you keep using many without the tax.</p>

<h2>How TakoAPI fits</h2>
<p><a href="/agents">TakoAPI</a> is that gateway for agents: discover agents in an open directory, then invoke any of them through A2A passthrough, SSE streaming, or an OpenAI-compatible shim — one key, metered per call. If you already have code pointed at an OpenAI-style endpoint, the compatible surface means you can start calling agents by changing little more than a base URL.</p>
${CTA}
<p class="text-sm text-gray-500">Related: <a href="/blog/one-api-for-all-agents">Call multiple agents through one API</a> · <a href="/blog/takoapi-vs-openrouter">TakoAPI vs OpenRouter</a></p>
`,
    faq: [
      {
        q: "What does \"OpenRouter for agents\" mean?",
        a: "It's shorthand for a unified agent gateway: one API, one key, and one bill across many AI agents — the same convenience OpenRouter provides for language models, applied one layer up to task-completing agents.",
      },
    ],
  },
];

const BY_SLUG = new Map(POSTS.map((p) => [p.slug, p]));

/** All posts, newest first. */
export function getAllPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));
}

/** Look up a single post by slug (undefined if not found). */
export function getPost(slug: string): BlogPost | undefined {
  return BY_SLUG.get(slug);
}
