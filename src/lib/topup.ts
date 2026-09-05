import { prisma } from "@/lib/prisma";
import { captureOrder } from "@/lib/paypal";
import { grantCredit } from "@/lib/billing";

// Platform fee on a top-up, as a percent of the gross amount. 0 = none.
export function topUpFeePct(): number {
  const n = Number(process.env.TAKO_TOPUP_FEE_PCT);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type CreditOutcome = "credited" | "already" | "failed";

// Capture an approved PayPal order and credit the buyer's balance — gross as a
// TOPUP entry plus an optional TOPUP_FEE so the ledger nets to what they keep.
//
// Idempotent on the order id (stored as providerRef): the browser-return path
// and the webhook both call this, and PayPal retries webhooks, so a second call
// is a no-op ("already"). Attributes to the order's custom_id (the userId set at
// creation), falling back to fallbackUserId (the session, on the return path).
export async function captureAndCredit(
  orderId: string,
  fallbackUserId?: string | null
): Promise<CreditOutcome> {
  const seen = await prisma.ledgerEntry.findFirst({
    where: { type: "TOPUP", providerRef: orderId },
    select: { id: true },
  });
  if (seen) return "already";

  let cap;
  try {
    cap = await captureOrder(orderId);
  } catch {
    // A concurrent return+webhook can race to capture; PayPal lets only one win
    // (the other throws ORDER_ALREADY_CAPTURED). If the winner already credited,
    // report success; otherwise it genuinely failed.
    const now = await prisma.ledgerEntry.findFirst({
      where: { type: "TOPUP", providerRef: orderId },
      select: { id: true },
    });
    return now ? "already" : "failed";
  }
  if (cap.status !== "COMPLETED") return "failed";

  const userId = cap.customId || fallbackUserId;
  if (!userId) return "failed";
  const gross = cap.amountUsd;
  if (!(gross > 0)) return "failed";

  const fee = topUpFeePct() > 0 ? Number((gross * (topUpFeePct() / 100)).toFixed(2)) : 0;
  await grantCredit(userId, gross, {
    type: "TOPUP",
    providerRef: orderId,
    note: `PayPal ${cap.captureId ?? orderId}`,
  });
  if (fee > 0) {
    await grantCredit(userId, -fee, { type: "TOPUP_FEE", providerRef: orderId, note: "Top-up fee" });
  }
  return "credited";
}
