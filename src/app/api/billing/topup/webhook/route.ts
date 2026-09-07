import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/requestLog";
import { paypalWebhookConfigured, verifyWebhookSignature } from "@/lib/paypal";
import { captureAndCredit } from "@/lib/topup";

// PayPal webhook receiver. Safety net for the top-up flow: if a buyer approves
// the order but never returns to the site (closed the tab), the
// CHECKOUT.ORDER.APPROVED event lets us still capture + credit. Idempotent with
// the browser-return path. All other event types are acknowledged and ignored.
export async function POST(req: NextRequest) {
  return withRequestLog(req, "/api/billing/topup/webhook", async () => {
    if (!paypalWebhookConfigured()) return NextResponse.json({ ignored: true });

    const raw = await req.text();
    let event: { event_type?: string; resource?: { id?: string } };
    try {
      event = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const verified = await verifyWebhookSignature(
      {
        authAlgo: req.headers.get("paypal-auth-algo") ?? "",
        certUrl: req.headers.get("paypal-cert-url") ?? "",
        transmissionId: req.headers.get("paypal-transmission-id") ?? "",
        transmissionSig: req.headers.get("paypal-transmission-sig") ?? "",
        transmissionTime: req.headers.get("paypal-transmission-time") ?? "",
      },
      event
    );
    if (!verified) return NextResponse.json({ error: "signature verification failed" }, { status: 400 });

    if (event.event_type === "CHECKOUT.ORDER.APPROVED" && event.resource?.id) {
      const outcome = await captureAndCredit(event.resource.id);
      if (outcome === "failed") {
        // Answering 200 here threw away PayPal's retry — our only second chance at
        // a payment that was captured but not credited. Fail the delivery instead so
        // PayPal redelivers; captureAndCredit is idempotent, so a retry that finds
        // the money already credited simply reports "already".
        console.error("[topup] webhook could not credit an approved order", {
          orderId: event.resource.id,
        });
        return NextResponse.json({ error: "capture or credit failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, outcome });
    }
    return NextResponse.json({ ok: true });
  });
}
