import { z } from "zod";

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

// Best-effort SSRF guard. Full protection needs DNS-resolution checks
// (a hardening TODO, see docs/agent-marketplace/03-technical-architecture.md §11).
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
  assertSafeUrl(cardUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(cardUrl, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
  } catch {
    throw new AgentCardError(`Could not reach ${cardUrl}`);
  } finally {
    clearTimeout(timer);
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
  return normalize(parsed.data, cardUrl);
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
