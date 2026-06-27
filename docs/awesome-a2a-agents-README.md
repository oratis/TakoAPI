# Awesome A2A Agents [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

> A curated list of awesome resources for the [Agent2Agent (A2A) Protocol](https://a2a-protocol.org/) — the open standard for communication and interoperability between independent AI agents.

The Agent2Agent (A2A) Protocol is an open standard, originally contributed by Google and now hosted by the Linux Foundation, that lets AI agents built on different frameworks and by different vendors discover one another, exchange messages, and collaborate as agents (not just as tools). This list collects official specs and SDKs, directories and gateways, framework integrations, tools, sample agents, and learning material for the A2A ecosystem.

## Contents

- [Official: Spec & Core](#official-spec--core)
- [Directories & Gateways](#directories--gateways)
- [Frameworks & Libraries with A2A Support](#frameworks--libraries-with-a2a-support)
- [Tools & Utilities](#tools--utilities)
- [Example Agents & Samples](#example-agents--samples)
- [Tutorials & Articles](#tutorials--articles)
- [Related Protocols](#related-protocols)
- [Community](#community)
- [Contributing](#contributing)
- [License](#license)

## Official: Spec & Core

The canonical protocol and the official SDKs maintained by the [a2aproject](https://github.com/a2aproject) organization under the Linux Foundation.

- [A2A Protocol](https://github.com/a2aproject/A2A) - The core Agent2Agent (A2A) open protocol specification.
- [A2A .NET SDK](https://github.com/a2aproject/a2a-dotnet) - Official C#/.NET SDK for the A2A Protocol.
- [A2A Documentation Site](https://a2a-protocol.org/) - Official protocol docs, specification, tutorials, and guides.
- [A2A Go SDK](https://github.com/a2aproject/a2a-go) - Official Go SDK for the A2A Protocol.
- [A2A Java SDK](https://github.com/a2aproject/a2a-java) - Official Java SDK for the A2A Protocol.
- [A2A JavaScript SDK](https://github.com/a2aproject/a2a-js) - Official JavaScript/TypeScript SDK for the A2A Protocol.
- [A2A Python SDK](https://github.com/a2aproject/a2a-python) - Official Python SDK for the A2A Protocol.
- [A2A Rust SDK](https://github.com/a2aproject/a2a-rs) - Rust SDK for the A2A Protocol.
- [A2A Samples](https://github.com/a2aproject/a2a-samples) - Official code samples demonstrating the A2A Protocol across languages and frameworks.
- [A2A TCK](https://github.com/a2aproject/a2a-tck) - Technology Compatibility Kit for testing A2A protocol implementations for conformance.

## Directories & Gateways

Registries and gateways that help discover, route to, or aggregate A2A-compatible agents.

- [A2A Registry](https://github.com/prassanna-ravishankar/a2a-registry) - Community-driven, open-source directory of live, hosted agents implementing the A2A Protocol.
- [ContextForge (MCP Context Forge)](https://github.com/IBM/mcp-context-forge) - IBM's open-source gateway, registry, and proxy that federates MCP, A2A, and REST/gRPC APIs behind a unified endpoint.
- [TakoAPI](https://takoapi.com) - Hosted directory and unified API gateway that lets you discover and invoke many AI agents (including A2A-capable ones) through a single endpoint.

## Frameworks & Libraries with A2A Support

Agent frameworks and protocol libraries that can expose agents as A2A servers, consume remote A2A agents, or both.

- [CrewAI](https://github.com/crewAIInc/crewAI) - Multi-agent framework with A2A delegation support via the `crewai[a2a]` extra, acting as A2A client and server.
- [FastA2A](https://github.com/datalayer/fasta2a) - Framework-agnostic Python implementation of the A2A protocol built on Starlette, usable with any agentic framework (ships a Pydantic AI bridge).
- [Google Agent Development Kit (ADK)](https://github.com/google/adk-python) - Google's open-source agent framework with built-in A2A support, including a `to_a2a()` helper to expose agents as A2A servers.
- [LangGraph](https://github.com/langchain-ai/langgraph) - Stateful multi-agent framework from LangChain with A2A agent-card support for serving agents as A2A-compliant endpoints.
- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) - Microsoft's Python/.NET framework (successor to Semantic Kernel and AutoGen) with cross-runtime A2A and MCP interoperability.
- [python-a2a](https://github.com/themanojdesai/python-a2a) - Third-party, easy-to-use Python library implementing the A2A protocol with agent discovery and MCP support.
- [Semantic Kernel](https://github.com/microsoft/semantic-kernel) - Microsoft's LLM orchestration SDK that supports invoking remote agents exposed over the A2A protocol.

## Tools & Utilities

- [A2A Inspector](https://github.com/a2aproject/a2a-inspector) - Web-based tool to connect to, inspect, debug, and validate A2A protocol servers and their agent cards.

## Example Agents & Samples

- [A2A-langgraph (langchain-samples)](https://github.com/langchain-samples/A2A-langgraph) - Demonstrates A2A conversations using LangGraph, with Python and TypeScript implementations.
- [A2AWalkthrough](https://github.com/holtskinner/A2AWalkthrough) - Step-by-step walkthrough of the A2A protocol; the basis for the DeepLearning.AI A2A course.
- [a2a-langgraph-agent](https://github.com/ctvs/a2a-langgraph-agent) - Sample showing how a LangGraph ReAct agent can be wrapped with the A2A protocol.

## Tutorials & Articles

- [A2A: The Agent2Agent Protocol (DeepLearning.AI)](https://www.deeplearning.ai/courses/a2a-the-agent2agent-protocol) - Short course built with Google Cloud and IBM Research on building and connecting A2A agents.
- [Agent-to-Agent (A2A) Protocol — CrewAI Docs](https://docs.crewai.com/en/learn/a2a-agent-delegation) - Official guide to A2A delegation and serving A2A agents in CrewAI.
- [ADK with the A2A Protocol](https://google.github.io/adk-docs/a2a/) - Official Google ADK documentation for building multi-agent systems with A2A.
- [Getting Started with A2A: Purchasing Concierge (Google Codelab)](https://codelabs.developers.google.com/intro-a2a-purchasing-concierge) - Hands-on codelab deploying A2A agents on Cloud Run and Agent Engine.
- [Inter-Agent Communication on A2A (AWS Open Source Blog)](https://aws.amazon.com/blogs/opensource/open-protocols-for-agent-interoperability-part-4-inter-agent-communication-on-a2a/) - AWS deep dive on A2A as part of its open agent-interoperability protocol series.

## Related Protocols

Complementary open standards in the agent-interoperability space.

- [Agent Connect Protocol (ACP)](https://github.com/agntcy/acp-spec) - AGNTCY collective's specification defining a standard REST interface to invoke and configure remote agents.
- [AGNTCY](https://github.com/agntcy) - Open collective and repos (incl. the ACP SDK) building an "Internet of Agents" infrastructure stack.
- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) - Open standard for connecting AI models and agents to external tools and data; commonly used alongside A2A.

## Community

- [A2A Protocol Documentation Site](https://a2a-protocol.org/) - Official home for the spec, SDK references, and guides, maintained by the Linux Foundation TSC.
- [a2aproject on GitHub](https://github.com/a2aproject) - Official GitHub organization where the protocol and SDKs are developed; issues and discussions are open to contributors.
- [`a2a` GitHub topic](https://github.com/topics/a2a) - Browse repositories tagged with the A2A topic on GitHub.

## Contributing

Contributions are welcome! Please open a pull request to add a resource. To keep this list useful:

- Only submit **real, verifiable** A2A-related projects with a working GitHub URL or official site.
- Use the format `- [Name](url) - One-line, neutral description ending with a period.`
- Keep entries **alphabetically ordered** within each section.
- Prefer actively maintained, substantive projects over abandoned or trivial ones.

See [CONTRIBUTING.md](CONTRIBUTING.md) (if present) for full guidelines.

## License

[![CC0](https://licensebuttons.net/p/zero/1.0/88x31.png)](https://creativecommons.org/publicdomain/zero/1.0/)

To the extent possible under law, the maintainers of this list (curated and maintained by [TakoAPI](https://takoapi.com)) have waived all copyright and related or neighboring rights to this work. This list is released under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

<!--
VERIFICATION NOTES FOR HUMAN REVIEW (remove before publishing):

All entries below were confirmed via web search/fetch to be real and A2A-related as of 2026-06-27. Items to double-check before publishing:

1. a2aproject/a2a-rs (Rust SDK) and a2aproject/a2a-dotnet — confirmed to exist on the org page, but not each repo individually fetched. The org also lists a2a-go, a2a-tck, a2a-inspector (all referenced and confirmed). Verify a2a-rs is the current canonical Rust repo (some sources also mention an unofficial `a2a-lf` crate — NOT included here).

2. FastA2A — the canonical repo MOVED from pydantic/fasta2a to datalayer/fasta2a (confirmed via the repo README). Used the datalayer URL. Confirm pydantic/fasta2a now redirects/points to datalayer, and that the move is still current.

3. TakoAPI description — based on fetching takoapi.com, which describes itself as "One API to access all agents" (a directory + unified gateway). The site's A2A-specific positioning is partial: it lists agents (some advertising A2A) rather than being a pure A2A registry. Description deliberately kept honest/modest. This is the self-owned entry.

4. LangGraph A2A support — confirmed via langchain-ai/langgraph issues, the LangChain forum, and docs.langchain.com (server-a2a). Support appears relatively new/declarative (AgentCard/AgentSkill + serve_a2a). Verify it is GA and not behind a preview flag.

5. Microsoft Agent Framework / Semantic Kernel — A2A support confirmed via microsoft/agent-framework, MicrosoftDocs/semantic-kernel-docs, and Microsoft devblogs. Both repos exist; A2A is via the agent-framework successor. Confirm Semantic Kernel itself (vs. only Agent Framework) still exposes A2A in current releases.

6. CrewAI A2A — confirmed via official docs.crewai.com/en/learn/a2a-agent-delegation. The crewAIInc/crewAI repo is the canonical CrewAI repo; A2A is an extra (`crewai[a2a]`).

7. ContextForge (IBM/mcp-context-forge) and prassanna-ravishankar/a2a-registry — both fetched and confirmed to exist with A2A support. Star counts not asserted (none stated anywhere, by design).

8. Example/community repos (langchain-samples/A2A-langgraph, holtskinner/A2AWalkthrough, ctvs/a2a-langgraph-agent, themanojdesai/python-a2a, datalayer/fasta2a) appeared in search results and were spot-checked; none individually deep-verified for current maintenance status. Re-confirm activity before publishing.

DELIBERATELY EXCLUDED (could not meet the quality/verification bar):
- therealpan/a2a-gateway — real, but only ~3 stars / very early; excluded as too low-signal.
- Various third-party "awesome-a2a" lists (ai-boost, pab1it0, isekos, forgewebO1, nMaroulis) — competing lists, intentionally not featured.
- a2a-protocol-semantic-kernel and similar single-author demo repos — too narrow; omitted in favor of official framework entries.
- "A2A Rust a2a-lf crate" — mentioned in one search summary but not independently verified; excluded.
-->
