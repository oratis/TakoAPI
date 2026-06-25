import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRequestLog } from "@/lib/requestLog";
import { paypalConfigured, captureOrder } from "@/lib/paypal";
import { grantCredit } from "@/lib/billing";

const BASE = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://takoapi.com";

// Platform fee charged on a top-up, as a percent of the gross amount. 0 = none.
function feePct(): number {
  const n = Number(process.env.TAKO_TOPUP_FEE_PCT);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function back(status: "success" | "error" | "cancel") {
  return NextResponse.redirect(`${BASE}/dashboard?topup=${status}`);
}

// PayPal redirects the buyer here after approval with ?token=<orderId>. We capture
// the order, credit the user (gross as TOPUP, minus an optional TOPUP_FEE so the
// ledger nets to what they receive), then bounce back to the dashboard. Idempotent
// on the order id so a refresh/replay never double-credits.
export async function GET(req: NextRequest) {
  return withRequestLog(req, "/api/billing/topup/return", async (logCtx) => {
    if (!paypalConfigured()) return back("error");

    const orderId = new URL(req.url).searchParams.get("token");
    if (!orderId) return back("error");

    const session = await auth();
    logCtx.userId = session?.user?.id ?? null;

    // Already processed this order → don't capture/credit again.
    const existing = await prisma.ledgerEntry.findFirst({
      where: { type: "TOPUP", providerRef: orderId },
      select: { id: true },
    });
    if (existing) return back("success");

    try {
      const cap = await captureOrder(orderId);
      if (cap.status !== "COMPLETED") return back("error");

      // Attribute to the order's custom_id (the userId set at creation); the session
      // is a fallback in case the cookie is present but custom_id is missing.
      const userId = cap.customId || session?.user?.id;
      if (!userId) return back("error");

      const gross = cap.amountUsd;
      if (!(gross > 0)) return back("error");
      const fee = feePct() > 0 ? Number((gross * (feePct() / 100)).toFixed(2)) : 0;

      await grantCredit(userId, gross, {
        type: "TOPUP",
        providerRef: orderId,
        note: `PayPal ${cap.captureId ?? orderId}`,
      });
      if (fee > 0) {
        await grantCredit(userId, -fee, { type: "TOPUP_FEE", providerRef: orderId, note: "Top-up fee" });
      }
      return back("success");
    } catch {
      return back("error");
    }
  });
}
