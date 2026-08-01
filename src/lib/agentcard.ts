import { z } from "zod";
import { lookup } from "node:dns/promises";

// ── A2A AgentCard parsing ────────────────────────────────────────────────
// Fetches and validates an A2A AgentCard (the canonical machine-readable
// descriptor for an invokable agent) and normalizes it into the shape our
// Agent / AgentSkillDef models expect. Lenient: unknown card fields ignored.
// See docs/agent-marketplace/01-landscape-and-standards.md (A2A section).

export class AgentCardError extends Error {}

const WELL_KNOWN = "/.well-known/agent-card.json";
const WELL_KNOWN_LEGACY = "/.well-known/agent.json"; // pre-v1 path, still in the wild

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

const AgentSkillSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(5_000).optional().nullable(),
  inputModes: z.array(z.string().max(100)).max(50).optional(),
  outputModes: z.array(z.string().max(100)).max(50).optional(),
  examples: z.array(z.string().max(2_000)).max(50).optional(),
});

const AgentCardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  url: z.string().url().max(1000).optional(), // service endpoint
  version: z.string().max(50).optional(),
  capabilities: z
    .object({
      streaming: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
    })
    .partial()
    .optional(),
  securitySchemes: z.record(z.string(), z.unknown()).optional(),
  skills: z.array(AgentSkillSchema).max(200).optional(),
});

export type ParsedAgentCard = {
  name: string;
  description: string;
  endpointUrl: string;
  cardUrl: string;
  streaming: boolean;
  pushNotify: boolean;
  securitySchemes: unknown | null;
  skills: {
    skillKey: string;
    name: string;
    description: string | null;
    inputModes: string[];
    outputModes: string[];
    examples: string[];
  }[];
};

// SSRF guard — first line: reject non-http(s) and literal private/loopback
// hosts from the URL string. Paired with assertPublicHost() (DNS/IP resolution)
// and manual per-hop redirect revalidation in fetchOne(), this closes the
// redirect-to-metadata and DNS-rebinding vectors. Residual: a connect-level
// TOCTOU (rebind between resolve and connect) still needs socket-level pinning —
// see docs/agent-marketplace/03-technical-architecture.md §11.
function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AgentCardError("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new AgentCardError("Only http(s) URLs are allowed");
  }
  if (process.env.NODE_ENV === "production") {
    const host = u.hostname;
    const blocked =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (blocked) throw new AgentCardError("Refusing to fetch a private/loopback address");
  }
  return u;
}

// True if an IPv4 literal is in a private / loopback / link-local / CGNAT range.
// Unparseable input is treated as unsafe (fail closed).
function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 127) return true; // 0.0.0.0/8, loopback
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking, non-routable
  return false;
}

// True if a resolved address (v4 or v6) is one we must not fetch from.
function ipIsPrivate(address: string, family: number): boolean {
  if (family === 4) return ipv4IsPrivate(address);
  const ip = address.toLowerCase();
  // IPv4-mapped / -embedded (e.g. ::ffff:169.254.169.254) → check the v4 part.
  const embedded = ip.match(/((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded) return ipv4IsPrivate(embedded[1]);
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
  return false;
}

// Resolve a hostname and refuse if ANY resolved address is private/loopback/
// link-local. Closes the DNS-rebinding gap that the string-only host check in
// assertSafeUrl can't catch (e.g. a public name pointing at 169.254.169.254).
// Prod-only, matching assertSafeUrl's guard, so localhost cards still work in dev.
async function assertPublicHost(hostname: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new AgentCardError(`Could not resolve ${hostname}`);
  }
  if (!addrs.length) throw new AgentCardError(`Host ${hostname} did not resolve`);
  for (const a of addrs) {
    if (ipIsPrivate(a.address, a.family)) {
      throw new AgentCardError("Refusing to fetch a private/loopback address");
    }
  }
}

function originOf(u: string): string {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}`;
  } catch {
    return u;
  }
}

function candidateUrls(input: string): string[] {
  const u = assertSafeUrl(input);
  // Direct card file → use as-is. Otherwise probe well-known paths on the origin.
  if (u.pathname.endsWith(".json")) return [u.toString()];
  const base = `${u.protocol}//${u.host}`;
  return [base + WELL_KNOWN, base + WELL_KNOWN_LEGACY];
}

function normalize(card: z.infer<typeof AgentCardSchema>, cardUrl: string): ParsedAgentCard {
  return {
    name: card.name,
    description: card.description || "",
    endpointUrl: card.url || originOf(cardUrl),
    cardUrl,
    streaming: !!card.capabilities?.streaming,
    pushNotify: !!card.capabilities?.pushNotifications,
    securitySchemes: card.securitySchemes ?? null,
    skills: (card.skills ?? []).map((s) => ({
      skillKey: s.id,
      name: s.name,
      description: s.description ?? null,
      inputModes: s.inputModes ?? [],
      outputModes: s.outputModes ?? [],
      examples: s.examples ?? [],
    })),
  };
}

async function fetchOne(cardUrl: string): Promise<ParsedAgentCard> {
  // Store the URL we were asked to fetch as the card's canonical URL, even if a
  // redirect serves the bytes from elsewhere (keeps stored cardUrl stable).
  const requested = assertSafeUrl(cardUrl).toString();
  let current = requested;
  // One timer bounds the whole redirect chain, not each hop.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      // Revalidate every hop: string checks + DNS/IP resolution. A "follow"
      // fetch would let a public URL redirect into a private address unchecked.
      const u = assertSafeUrl(current);
      await assertPublicHost(u.hostname);

      let res: Response;
      try {
        res = await fetch(current, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
          redirect: "manual",
        });
      } catch {
        throw new AgentCardError(`Could not reach ${current}`);
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new AgentCardError("Redirect without a Location header");
        if (hop >= MAX_REDIRECTS) throw new AgentCardError("Too many redirects");
        current = new URL(loc, current).toString(); // resolve relative redirects
        continue;
      }

      if (!res.ok) throw new AgentCardError(`AgentCard fetch returned HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new AgentCardError("AgentCard response too large");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AgentCardError("AgentCard is not valid JSON");
      }
      const parsed = AgentCardSchema.safeParse(json);
      if (!parsed.success) throw new AgentCardError("Not a valid A2A AgentCard");
      return normalize(parsed.data, requested);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and parse an A2A AgentCard. Accepts either a direct card URL
 * (…/agent-card.json) or an origin/base URL (we probe the well-known paths).
 */
export async function fetchAgentCard(inputUrl: string): Promise<ParsedAgentCard> {
  const candidates = candidateUrls(inputUrl);
  let lastErr: unknown;
  for (const cardUrl of candidates) {
    try {
      return await fetchOne(cardUrl);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new AgentCardError("Failed to fetch AgentCard");
}
