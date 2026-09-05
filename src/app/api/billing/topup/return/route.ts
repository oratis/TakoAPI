import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRequestLog } from "@/lib/requestLog";
import { paypalConfigured } from "@/lib/paypal";
import { captureAndCredit } from "@/lib/topup";

const BASE = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://takoapi.com";

function back(status: "success" | "error" | "cancel") {
  return NextResponse.redirect(`${BASE}/dashboard?topup=${status}`);
}

// PayPal redirects the buyer here after approval with ?token=<orderId>. Capture
// + credit happen in the shared, idempotent captureAndCredit (also used by the
// webhook safety net), then we bounce back to the dashboard with a status.
export async function GET(req: NextRequest) {
  return withRequestLog(req, "/api/billing/topup/return", async (logCtx) => {
    if (!paypalConfigured()) return back("error");

    const orderId = new URL(req.url).searchParams.get("token");
    if (!orderId) return back("error");

    const session = await auth();
    logCtx.userId = session?.user?.id ?? null;

    const outcome = await captureAndCredit(orderId, session?.user?.id);
    return back(outcome === "failed" ? "error" : "success");
  });
}
