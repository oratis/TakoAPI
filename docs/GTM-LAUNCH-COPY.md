# Launch copy — drafts

Ready-to-post drafts for the coordinated launch. **Post Show HN + Reddit + Twitter the same morning** (US Eastern Tue–Thu, 8–10am) so the day's traffic stacks into GitHub Trending. Edit in your own voice before posting — authenticity outperforms polish.

**Red lines:** never ask for upvotes (auto-flag/ban on HN + Reddit). Never buy stars. Reply to every comment for the first few hours — engagement is the ranking signal.

---

## 1. Show HN

**Title** (≤80 chars, no hype/caps, no trailing period) — pick one. **B** tends to land fastest on HN because the OpenRouter analogy is instantly legible:
```
A) Show HN: TakoAPI – One API to discover and call any AI agent (A2A directory)
B) Show HN: TakoAPI – OpenRouter for AI agents (open A2A directory + gateway)
C) Show HN: A neutral directory + one API for the fragmenting AI-agent world
```

**Body** (the text field — or paste as your first comment right after posting):
```
Hi HN — I built TakoAPI, an open directory + unified gateway for AI agents.

The problem: the agent-to-agent (A2A) space is fragmenting fast — every agent
has its own endpoint, auth, and card format, and there's no neutral place to
discover them or call them uniformly. It feels like the pre-npm, pre-OpenRouter
moment for agents.

TakoAPI is two things:

- Directory — hosted A2A agents (described by open AgentCards) alongside
  hundreds of open-source agent projects. Browsable, plus a registry API:
  `GET /api/registry` returns the whole catalog as Markdown or JSON (handy to
  paste straight into an LLM).
- Gateway — call any hosted agent through one API: A2A passthrough, SSE
  streaming, and an OpenAI-compatible /v1/chat/completions shim, metered per key.

It also installs into coding agents (Claude Code, Codex, OpenCode) with one
command, and runs as a hosted MCP server (search_agents, invoke_agent, …).

Live: https://takoapi.com — open source (MIT): https://github.com/oratis/TakoAPI
Stack: Next.js + Postgres/Prisma on Cloud Run.

Honest status: early. The directory is real (50+ hosted agents + hundreds
of indexed projects), the gateway + per-key metering work, prepaid credits are
live. Two-sided payouts and smart routing across agents are next.

I'd love feedback on two things especially: (1) the directory model — is a
neutral catalog useful, or does everyone just want their own storefront? and
(2) the A2A-vs-MCP framing — where do you see the line?
```

**First comment** — post this as your own first reply immediately after submitting. On Show HN this comment carries the most weight (context + credibility) and seeds the discussion:
```
(Author here.) A bit of backstory and the decisions I went back and forth on,
since Show HN readers usually want the "why":

Why: every agent — A2A, OpenAI-compatible, or MCP — has its own endpoint, auth,
and card format, and there's no neutral place to find them or call them the same
way. OpenRouter solved discovery + access for LLMs; nothing equivalent existed
for agents. So TakoAPI is deliberately two layers: a directory (discovery, open
AgentCards) and a thin gateway (one API, per-key metering) on top.

Things I'm genuinely unsure about and would love HN's take on:
- Directory vs storefront: I list everyone (including projects that compete with
  each other) instead of curating a storefront. Bet: the neutral discovery layer
  is more defensible than any single storefront. Is that right?
- A2A vs MCP: I treat them as complementary — MCP for tools a model calls, A2A
  for agents calling agents — and the gateway speaks both plus an OpenAI shim so
  existing clients work unchanged. Where would you draw the line?
- Payments: prepaid credits + metering are live; two-sided payouts (so listed
  agents can charge) are next — the harder trust/settlement problem.

Stack: Next.js on Cloud Run, Postgres/Prisma. Happy to go deep on any of it.
```

---

## 2. Reddit — r/AI_Agents, r/LocalLLaMA, r/LLMDevs

Read each sub's rules first; some require a flair or ban links in the title. Lead with the problem, not the product.

**Title:**
```
I built an open directory + gateway for AI agents (A2A) — one API to discover and call any agent
```

**Body:**
```
The A2A ("agent-to-agent") ecosystem is growing fast but there's no neutral
place to *find* agents or call them the same way — every one has its own
endpoint, auth, and card format.

So I built TakoAPI (open source, MIT):
- a directory of hosted A2A agents + thousands of open-source agent projects
- a gateway that calls any hosted agent through one API (A2A, SSE streaming, or
  an OpenAI-compatible endpoint), metered per key
- a registry API that dumps the whole catalog as Markdown/JSON for LLMs
- one-command install into Claude Code / Codex / OpenCode, and an MCP server

It's live at takoapi.com. It's early and I'm looking for blunt feedback:
what would make a neutral agent directory actually useful to you — or is this a
problem you don't have yet? What's missing?
```

---

## 3. Twitter / X — thread

```
1/ The AI-agent world has an npm problem: hundreds of agents, no shared place to
   discover them and no common way to call them.

   So I built TakoAPI — one open API to discover and call any AI agent. 🐙
   https://takoapi.com

2/ It's a directory: hosted A2A agents (open AgentCards) + thousands of
   open-source agent projects, all browsable — plus a registry API that returns
   the whole catalog as Markdown you can paste into an LLM.

3/ And a gateway: call any hosted agent through one API — A2A passthrough, SSE
   streaming, or an OpenAI-compatible /v1/chat/completions shim. Metered per key.

4/ Bonus: one-command install into Claude Code / Codex / OpenCode, and it runs
   as a hosted MCP server (search_agents, get_agent, invoke_agent).

5/ Open source (MIT), built on Next.js + Postgres, live on Cloud Run.
   Early days — I'd love your feedback on the directory model.
   ⭐ https://github.com/oratis/TakoAPI
```

---

## Posting checklist
- [ ] README polished, repo has a clear description + topics (ai-agents, a2a, llm, openrouter, mcp)
- [ ] Analytics + Search Console live (so you can measure the spike)
- [ ] Screenshot/OG image looks right when the link unfurls
- [ ] Free to browse with no signup wall on the landing path
- [ ] You have ~3 hours free after posting to reply to every comment
- [ ] Show HN + top Reddit + Twitter fired within the same 1–2 hour window
