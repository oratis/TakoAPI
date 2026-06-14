// Centralized SEO constants. The canonical production origin is takoapi.com
// regardless of NEXTAUTH_URL (which is localhost in dev), so canonical/OG/sitemap
// URLs are always absolute and correct. Override with NEXT_PUBLIC_SITE_URL.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://takoapi.com").replace(/\/$/, "");
export const SITE_NAME = "TakoAPI";
export const SITE_TAGLINE = "One API to access all agents";
export const SITE_DESCRIPTION =
  "Discover and invoke AI agents through one unified API — an OpenRouter for agents. Browse a directory of hundreds of open-source agent projects and thousands of OpenClaw skills for your coding agent.";

export const SITE_KEYWORDS = [
  "AI agents",
  "agent API",
  "agent marketplace",
  "agent directory",
  "A2A",
  "agent gateway",
  "OpenRouter for agents",
  "autonomous agents",
  "LLM agents",
  "OpenClaw skills",
  "MCP",
];

/** Join a path onto the canonical site origin. */
export function absoluteUrl(path = ""): string {
  if (!path) return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
