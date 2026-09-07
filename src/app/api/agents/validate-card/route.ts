import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, parseJson, unauthorized } from "@/lib/api";
import { resolveApiUser } from "@/lib/api-user";
import { AgentCardError, fetchAgentCard } from "@/lib/agentcard";
import { NO_STORE_HEADERS } from "@/lib/http";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";

// Dry run of the AgentCard half of POST /api/agents/submit: fetch and parse the
// card, hand back what *would* be listed, and write nothing. The publish form
// calls this behind "Check card" so a publisher sees the parsed name, endpoint
// and skills — or the exact AgentCardError — while they can still fix the URL,
// instead of discovering an unreachable card only after the form has posted.
//
// The only rows this touches are the rate-limit bucket and the request log; a
// preview must never create an Agent.

const validateCardSchema = z.object({
  cardUrl: z.string().url().max(500),
});

export async function POST(req: NextRequest) {
  return withRequestLog(req, "/api/agents/validate-card", async (logCtx) => {
    // Authenticate before rate limiting so the bucket can be keyed on the user.
    // This endpoint fetches a caller-supplied URL, which makes it the most
    // attractive thing here to use as a fetch proxy, and the IP that
    // `checkRateLimit` would otherwise bucket on comes from a caller-controlled
    // header (see `extractClientIp`) — i.e. free to rotate. The user id is not.
    const user = await resolveApiUser(req);
    if (!user) return unauthorized();
    logCtx.userId = user.id;

    const rl = await checkRateLimit(req, {
      key: `agent-card-validate:${user.id}`,
      windowMs: 60 * 60 * 1000,
      max: 20,
      perIp: false,
    });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const parsed = await parseJson(req, validateCardSchema);
    if (!parsed.ok) return parsed.response;

    try {
      const card = await fetchAgentCard(parsed.data.cardUrl);
      return NextResponse.json(
        {
          name: card.name,
          description: card.description,
          // The URL we would store, which is not always the one that was typed:
          // an origin gets resolved to a well-known card path.
          cardUrl: card.cardUrl,
          endpointUrl: card.endpointUrl,
          streaming: card.streaming,
          pushNotify: card.pushNotify,
          // Names only — the preview counts capabilities and lists them; the
          // full skill records are written by /api/agents/submit.
          skills: card.skills.map((skill) => ({ name: skill.name })),
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      // Carry the message as a field detail as well: it is always about the URL
      // the publisher typed, so the form can render it against that input rather
      // than in a bar at the bottom of the page.
      const message =
        error instanceof AgentCardError
          ? error.message
          : "Could not fetch or parse the AgentCard";
      return badRequest(message, [{ path: "cardUrl", message }]);
    }
  });
}
