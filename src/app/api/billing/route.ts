import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalance } from "@/lib/billing";
import { unauthorized } from "@/lib/api";

// Credits + ledger summary for the current user. Backs the dashboard billing
// panel. Balance and the immutable ledger are written by src/lib/billing.ts
// (DEBIT on each billed call; TOPUP once Stripe is wired). Read-only here.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const [balanceUsd, ledger] = await Promise.all([
    getBalance(userId),
    prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return NextResponse.json({
    balanceUsd,
    // Stripe top-up isn't wired yet — the UI shows credits as read-only until then.
    topUpEnabled: false,
    ledger: ledger.map((e) => ({
      id: e.id,
      type: e.type,
      amountUsd: Number(e.amountUsd),
      note: e.note,
      createdAt: e.createdAt,
    })),
  });
}
