import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { unauthorized, parseJson, jsonError } from "@/lib/api";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { withRequestLog } from "@/lib/requestLog";
import { paypalConfigured, createOrder } from "@/lib/paypal";

const BASE = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://takoapi.com";

// Start a PayPal credit top-up: create an order and hand the approval URL back to
// the client, which redirects the browser to PayPal. Capture happens on return at
// /api/billing/topup/return. Disabled (503) until PayPal creds are configured.
const schema = z.object({ amountUsd: z.number().min(5).max(500) });

export async function POST(req: NextRequest) {
  return withRequestLog(req, "/api/billing/topup", async (logCtx) => {
    if (!paypalConfigured()) return jsonError("Top-up is not available yet", 503, "TOPUP_DISABLED");

    const rl = await checkRateLimit(req, { key: "topup", windowMs: 60_000, max: 10 });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    logCtx.userId = userId;

    const parsed = await parseJson(req, schema);
    if (!parsed.ok) return parsed.response;

    const order = await createOrder({
      amountUsd: parsed.data.amountUsd,
      returnUrl: `${BASE}/api/billing/topup/return`,
      cancelUrl: `${BASE}/dashboard?topup=cancel`,
      reference: userId,
    });
    return NextResponse.json({ approveUrl: order.approveUrl, orderId: order.id });
  });
}
