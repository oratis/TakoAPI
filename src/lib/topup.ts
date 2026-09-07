import { prisma } from "@/lib/prisma";
import { captureOrder } from "@/lib/paypal";
import { applyTopUp } from "@/lib/billing";

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
    if (now) return "already";
    console.error("[topup] capture call failed and nothing was credited", { orderId });
    return "failed";
  }
  // Past this point PayPal has (or may have) taken the buyer's money, so every exit
  // that does not credit them is a real discrepancy. These used to be bare
  // `return "failed"`s: no ledger row, no log, nothing to reconcile against.
  if (cap.status !== "COMPLETED") {
    // Most likely a PENDING capture (e.g. an eCheck that settles later). We only
    // subscribe to CHECKOUT.ORDER.APPROVED, so nothing brings us back when it does.
    console.error("[topup] captured order is not COMPLETED — buyer not credited", {
      orderId,
      captureId: cap.captureId,
      status: cap.status,
      amountUsd: cap.amountUsd,
    });
    return "failed";
  }

  const userId = cap.customId || fallbackUserId;
  if (!userId) {
    console.error("[topup] captured payment cannot be attributed to a user", {
      orderId,
      captureId: cap.captureId,
      amountUsd: cap.amountUsd,
    });
    return "failed";
  }
  const gross = cap.amountUsd;
  if (!(gross > 0)) {
    console.error("[topup] captured payment has a non-positive amount", {
      orderId,
      captureId: cap.captureId,
      userId,
      amountUsd: gross,
    });
    return "failed";
  }

  const fee = topUpFeePct() > 0 ? Number((gross * (topUpFeePct() / 100)).toFixed(2)) : 0;
  try {
    // Gross + fee in ONE transaction. Two separate writes meant a crash in between
    // left the fee unwritten forever: the retry saw the TOPUP row, said "already",
    // and the platform silently ate the fee on that payment.
    await applyTopUp(userId, gross, fee, {
      providerRef: orderId,
      note: `PayPal ${cap.captureId ?? orderId}`,
    });
  } catch (err) {
    console.error("[topup] money captured but crediting failed", {
      orderId,
      captureId: cap.captureId,
      userId,
      grossUsd: gross,
      feeUsd: fee,
      err: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
  return "credited";
}
