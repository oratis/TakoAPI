# TakoAPI — Ready-to-Submit "Awesome List" PR Materials

**Project:** TakoAPI — "One API to access all agents." An open directory + unified gateway for AI agents (OpenRouter-style, but for agents). Exposes an A2A (Agent-to-Agent) directory, an OpenAI-compatible gateway, SSE streaming, a hosted MCP server, and a marketplace of OpenClaw/coding-agent skills. Metered per API key with PayPal top-ups.
**Site:** https://takoapi.com  **Repo:** https://github.com/oratis/TakoAPI

> Research date: 2026-06-27. Facts below were verified by fetching each repo's README / CONTRIBUTING and the GitHub API. Where something could not be verified, it is called out explicitly. Repo URLs were confirmed to resolve (HTTP 200/redirect). Re-check the exact neighboring entries at submission time, since lists change.

---

## Summary table

| List | Repo | Maintained? | TakoAPI eligible? | Best section |
|---|---|---|---|---|
| awesome-a2a | `ai-boost/awesome-a2a` | Yes — pushed 2026-06-25, 624★ | **Yes** | Tools & Utilities (A2A directory/gateway) |
| awesome-ai-agents | `e2b-dev/awesome-ai-agents` | **Content stale** — last content push 2025-02-26, 28.5k★ | **No / wrong list** — it's "only for AI assistants and agents," not infra. Redirect to sibling list below | n/a |
| └ (redirect) awesome SDKs for AI agents | `e2b-dev/awesome-ai-sdks` | Yes (active PRs) | **Yes** — gateways/tools fit | Agent infrastructure / tools |
| awesome-llm-agents | `kaushikb11/awesome-llm-agents` | Yes — pushed 2026-06-21, 1.5k★ | **Borderline** — list is for *frameworks*, not hosted gateways. See note | Frameworks (weak fit) |
| awesome-mcp (servers) | `wong2/awesome-mcp-servers` | Yes — pushed 2026-06-13, 4.2k★ | **Yes**, but **no PRs accepted** — submit via website form | Community Servers |

There are multiple competing "awesome-a2a" and "awesome-ai-agents" forks. The most-starred, actively-maintained canonical one is chosen in each case, with alternates listed.

---

## 1. awesome-a2a — `ai-boost/awesome-a2a`

- **Repo:** https://github.com/ai-boost/awesome-a2a
- **Maintenance:** Active. GitHub API: `pushed_at` = 2026-06-25, 624 stars, not archived, MIT-licensed. ~195 commits at time of research.
- **Eligibility:** **Eligible.** CONTRIBUTING (`/CONTRIBUTING.md`, verified) states inclusion = anything "directly related to Google's Agent2Agent Protocol": implementations, tools, framework integrations, complementary protocols. It **explicitly excludes "promotional content"** and "general AI resources lacking A2A specificity." → Frame TakoAPI as an *A2A directory/gateway*, with a neutral one-line description, **not** marketing copy. No open-source-only rule.
- **Best section:** **Tools & Utilities** (TakoAPI is an A2A agent directory + gateway, not an SDK/library). Sections present: Official Resources · Specification & Core Concepts · Implementations & Libraries · Tools & Utilities · Tutorials & Articles · Demos & Examples · Related Protocols & Concepts · Community.

**Entry format (verified from CONTRIBUTING):**
`*   <emoji> [Resource Title](link) - A brief, informative description`
Emoji prefix is a tech/type marker (🌟 official, 🐍 Python, ⚙️ tool, 🔗 link, etc.). Ordering within a section is "alphabetical appreciated but not enforced."

**Exact entry to add (in "Tools & Utilities"):**
```markdown
*   ⚙️ [TakoAPI](https://takoapi.com) - Open directory and unified gateway for A2A agents, with an OpenAI-compatible endpoint, SSE streaming, and a hosted MCP server.
```

- **Alphabetical position:** Open the section and place "TakoAPI" in its correct alphabetical slot (sorts under "T"). If the section is not alphabetized, append to the end — both are acceptable per CONTRIBUTING. (Exact current neighbors were not enumerated to avoid guessing — confirm at submission.)

**PR title (follows their `[Emoji] [Action] [Object]` convention):**
```
✨ Add TakoAPI (A2A directory & unified gateway) to Tools & Utilities
```

**PR body:**
```
Adds TakoAPI to the Tools & Utilities section.

TakoAPI is an open directory and unified gateway for A2A agents — it exposes an
A2A agent directory, an OpenAI-compatible gateway, SSE streaming, and a hosted
MCP server. Relevance to this list: it implements/consumes the Agent2Agent
protocol as a discovery + routing layer for A2A agents.

- Site: https://takoapi.com
- Placed alphabetically under "T" in Tools & Utilities.
- Description kept to one neutral sentence per CONTRIBUTING; no promotional language.
```

- **Gotchas:** Keep the description factual (their CONTRIBUTING bans promotional content). Use the `⚙️` (tool) emoji, not `🌟` (reserved for official A2A resources). Match the existing emoji-prefix style exactly.
- **Alternate forks (not recommended as primary):** `pab1it0/awesome-a2a`, `forgewebO1/Awesome-A2A`, `isekos/awesome-a2a-agents`. The `a2aproject/*` org is the protocol itself (spec/SDKs/samples), **not** an awesome-list — don't PR there.

---

## 2. awesome-ai-agents — `e2b-dev/awesome-ai-agents` → redirect to `e2b-dev/awesome-ai-sdks`

- **Repo:** https://github.com/e2b-dev/awesome-ai-agents (28,492★)
- **Maintenance of the *content*:** **Stale.** GitHub API `pushed_at` = **2025-02-26** (≈16 months before research date). `updated_at` only reflects star/metadata changes, not content commits. There is **no `CONTRIBUTING.md`** (verified 404); contribution instructions live in the README.
- **Eligibility:** **Not a fit for this list.** The README states verbatim: *"For adding AI agents'-related SDKs, frameworks and tools, please visit Awesome SDKs for AI Agents. This list is only for AI assistants and agents."* TakoAPI is infrastructure (a gateway/directory/tool), **not an agent/assistant**, so it does not belong here. **Skip this list** and submit to the sibling instead.

### Redirect target: `e2b-dev/awesome-ai-sdks` (the "SDKs/tools/gateways" list)

- **Repo:** https://github.com/e2b-dev/awesome-ai-sdks (the README's link `awesome-sdks-for-ai-agents` 301-redirects here — both URLs work).
- **Scope:** "SDKs, frameworks, libraries, and tools for creating, monitoring, debugging and deploying autonomous AI agents." Includes agent-protocol implementations and runtime/infra (E2B, Fixie, observability platforms). A unified API gateway / agent directory fits as **agent infrastructure tooling**.
- **Maintenance:** Active (open PRs/issues). Contribution process: README says *"You have something to add or improve about our list? Do it via pull request."*
- **Eligibility:** **Eligible.** No open-source-only rule observed (commercial/hosted infra like E2B and observability SaaS are listed).
- **Entry format:** e2b collapsible-`<details>` style (template below). Open the README before submitting and drop TakoAPI into the closest infrastructure/gateway category, alphabetically. (Exact current category headings / open-vs-closed split were not verified.)

**e2b entry template (mirrors the agents repo's format):**
```markdown
## [TakoAPI](https://takoapi.com)
One API to access all agents — open directory + unified gateway for AI agents.

<details>

![Image](https://takoapi.com/opengraph-image)

### Category
Agent gateway, Agent directory, Infrastructure

### Description

- **Unified gateway**: One OpenAI-compatible API endpoint to route to many agents.
- **A2A directory**: Open, browsable directory of Agent-to-Agent (A2A) agents.
- **Hosted MCP server**: Exposes tools to agents over the Model Context Protocol.
- **SSE streaming**: Streamed responses for interactive agent use.
- **Skills marketplace**: Directory of OpenClaw / coding-agent skills.
- **Metered billing**: Per-API-key usage metering with PayPal top-ups.

### Links
- [Website](https://takoapi.com)
- [GitHub](https://github.com/oratis/TakoAPI)
</details>
```
> The `![Image]` uses TakoAPI's live OG image (`https://takoapi.com/opengraph-image`). Confirm it returns 200 before submitting — a broken image will fail review.

**PR title:**
```
Add TakoAPI (unified agent gateway + A2A directory)
```
**PR body:**
```
Adds TakoAPI to the list.

TakoAPI is a unified gateway and open directory for AI agents: an
OpenAI-compatible API, an A2A agent directory, SSE streaming, and a hosted MCP
server. Submitted here (the SDKs/tools list) rather than awesome-ai-agents,
since per that list's README it is "only for AI assistants and agents" and
TakoAPI is agent infrastructure.

- Site: https://takoapi.com
- Placed alphabetically under "T" in the relevant infrastructure/gateway category.
```

- **Gotchas:** (1) The agents-list README also offers a Google Form (`forms.gle/UXQFCogLYrPFvfoUA`) as an alternative to PRs and requires **alphabetical order within the correct category**. (2) Confirm the SDK repo's actual category names at submission. (3) Provide a working image URL.

---

## 3. awesome-llm-agents — `kaushikb11/awesome-llm-agents`

- **Repo:** https://github.com/kaushikb11/awesome-llm-agents
- **Maintenance:** Active. API: `pushed_at` = 2026-06-21, 1,516★, not archived. README header says "Last updated: 2026-06-21." **No LICENSE file** (verified 404) — minor, doesn't affect contributions.
- **Eligibility:** **Borderline / weak fit — recommend caution.** This list is explicitly a catalog of **LLM agent *frameworks*** ("frameworks and agent development tools," emphasizing code-based solutions over hosted services). It leans open-source (entries show stars/forks/license, mostly MIT/Apache, e.g. AutoGPT, CrewAI). TakoAPI is a **hosted gateway/directory**, not a framework you install — so it does **not** cleanly match the inclusion theme. The only section is a flat **Frameworks** list, ordered by popularity (star count), **not alphabetical**.
- **Honest recommendation:** **Skip or low-priority.** If submitting anyway, frame TakoAPI as an "agent gateway / development tool," expect possible rejection on scope grounds, and note that entries carry a metrics block (stars/forks/contributors/issues/language/license).
- **Contribution rules:** README invites "open an issue or pull request." **No formal CONTRIBUTING.md found** — no strict entry template confirmed beyond matching the existing metrics-block format. (Unverified.)

**If submitting anyway, suggested entry (match existing metrics-block style):**
```markdown
### [TakoAPI](https://github.com/oratis/TakoAPI)
One API to access all agents — a unified gateway and open directory for AI agents, with an OpenAI-compatible endpoint, SSE streaming, and a hosted MCP server.

- One OpenAI-compatible API to route across many agents
- Open A2A (Agent-to-Agent) directory
- Hosted MCP server + SSE streaming
- Metered per-API-key billing
```
- **Position:** Sorted by star count, so no alphabetical slot — lands wherever its star count falls.
- **PR title:** `Add TakoAPI (agent gateway) to Frameworks`
- **PR body:** State plainly that TakoAPI is a gateway/dev tool for agents and ask maintainers whether it fits the frameworks scope (pre-empt the scope objection).
- **Gotchas:** Not alphabetical (popularity-ordered); entries expect a live metrics block; scope is framework-centric → real rejection risk.
- **Alternates considered:** `hyp1231/awesome-llm-powered-agent` (papers/research), `junhua/awesome-llm-agents` (reading list), `slavakurilyak/awesome-ai-agents`, `kyrolabs/awesome-agents`. None is a better fit for a hosted gateway than the e2b SDKs list above.

---

## 4. awesome-mcp (servers) — `wong2/awesome-mcp-servers`

- **Repo:** https://github.com/wong2/awesome-mcp-servers
- **Maintenance:** Active. API: `pushed_at` = 2026-06-13, 4,185★, not archived. ~470 commits.
- **Eligibility under inclusion rules:** **Eligible** — the list accepts **remote/hosted** MCP servers, not just locally-runnable ones (it lists fully-remote servers with hosted `https://…/mcp` URLs). TakoAPI's **hosted MCP server qualifies.** Sections: Reference Servers · Official Servers · **Community Servers** (TakoAPI → Community Servers). Entries are alphabetical within each category. No open-source-only requirement observed.
- **CRITICAL gotcha — NO PULL REQUESTS:** README states verbatim: **"We do not accept PRs. Please submit your MCP on the website: https://mcpservers.org/submit"**. There is **no PR to write** — submit through the web form at **https://mcpservers.org/submit**, which feeds both the website and the GitHub list.

**Form submission content (fields):**
- **Name:** TakoAPI
- **URL / endpoint:** `https://takoapi.com/mcp` (confirm the exact path before submitting; the convention is a directly-usable remote `…/mcp` URL).
- **Homepage:** https://takoapi.com
- **Category:** Community Servers
- **Description (one line, to match list style):**
  > Hosted MCP server for TakoAPI — exposes the unified agent gateway and A2A agent directory as MCP tools, usable remotely with no local install.

**Resulting list entry would render as (their format):**
```markdown
- [TakoAPI](https://takoapi.com) - Hosted, remote MCP server exposing TakoAPI's unified agent gateway and A2A directory as tools (no local install).
```
- **Gotchas:** (1) **Do not open a GitHub PR — it will be closed.** Use the website form only. (2) Provide a real, working remote MCP URL; "remote" entries are expected to be usable as-is. (3) Sorts alphabetically under "T" within Community Servers (handled by maintainers from the form).
- **Note on the broader MCP ecosystem:** The official `modelcontextprotocol/servers` repo is a curated *reference/official* server list with a strict CONTRIBUTING + test-coverage process and is **not** an "awesome-list" for third-party hosted services — TakoAPI is better placed in `wong2/awesome-mcp-servers` (and optionally `appcypher/awesome-mcp-servers`, an alternate community list whose rules were not fully verified).

---

## What could NOT be fully verified (be honest in the PRs)

1. **Exact current neighbors** for alphabetical placement in awesome-a2a (Tools & Utilities) and awesome-ai-sdks — the rendered lists group by type, so confirm the precise A–Z slot at submission time. Neighbor names were deliberately not fabricated.
2. **awesome-ai-sdks exact category headings** and whether it splits open/closed-source — open the README before placing the entry.
3. **awesome-llm-agents formal contribution rules** — no CONTRIBUTING.md found; only the README's "open an issue or PR." Treated as unverified.
4. **TakoAPI's exact hosted MCP endpoint path and a valid logo/OG image URL** — verify `https://takoapi.com/mcp` and `https://takoapi.com/opengraph-image` return 200 before submitting (broken links/images are the most common rejection cause).

## Recommended priority order
1. **awesome-mcp-servers** (web form — fastest, clearly eligible, no PR friction).
2. **awesome-a2a** (`ai-boost`) — strong, on-theme fit; active maintainer.
3. **awesome-ai-sdks** (e2b sibling) — correct home for a gateway; PR or Google Form.
4. **awesome-llm-agents** — optional/low-priority; scope mismatch, expect possible rejection.

**Skip:** `e2b-dev/awesome-ai-agents` directly (wrong list + content stale ~16 months).

Sources: [ai-boost/awesome-a2a](https://github.com/ai-boost/awesome-a2a) · [e2b-dev/awesome-ai-agents](https://github.com/e2b-dev/awesome-ai-agents) · [e2b-dev/awesome-ai-sdks](https://github.com/e2b-dev/awesome-ai-sdks) · [kaushikb11/awesome-llm-agents](https://github.com/kaushikb11/awesome-llm-agents) · [wong2/awesome-mcp-servers](https://github.com/wong2/awesome-mcp-servers) · [mcpservers.org/submit](https://mcpservers.org/submit)
