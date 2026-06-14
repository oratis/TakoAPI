import { prisma } from "@/lib/prisma";
import type { AgentProtocol, LedgerType, PricingModel } from "@prisma/client";

// Phase 3 billing — metering + prepaid-credit ledger. The gateway records every
// call and, when it has a cost, debits the caller's balance against an immutable
// ledger. Stripe top-up is not wired yet; `grantCredit` funds balances meanwhile.
// See docs/agent-marketplace/03-technical-architecture.md §5–6 and 04-data-model.md §2.

/**
 * USD charge for one gateway call given the agent's pricing. Groundwork:
 * token-accurate metering isn't wired yet, so `units` defaults to 1 (per
 * call/task). Callers should pass a successful call only — bill 0 on failure.
 */
export function computeBilledUsd(pricingModel: PricingModel, unitPriceUsd: unknown, units = 1): number {
  if (pricingModel === "FREE") return 0;
  const price = unitPriceUsd == null ? 0 : Number(unitPriceUsd);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Number((price * units).toFixed(6));
}

export type MeterInput = {
  apiKeyId?: string | null;
  userId?: string | null;
  agentId: string;
  protocol: AgentProtocol;
  status: number;
  latencyMs?: number | null;
  taskState?: string | null;
  errorCode?: string | null;
  units?: number;
  billedUsd?: number;
};

/**
 * Record one invocation, bump the agent's call count, and — when the call has a
 * cost — write the matching DEBIT ledger entry and decrement the caller's credit
 * balance, all in a single transaction so the ledger and balance stay consistent.
 *
 * Fire-and-forget safe: never throws, so the gateway response is never blocked or
 * failed by metering/billing. Durable async aggregation (a queue) is the
 * production hardening — see docs/agent-marketplace/03-technical-architecture.md §5.
 */
export async function meterInvocation(input: MeterInput): Promise<void> {
  const units = input.units ?? 1;
  const billedUsd = input.billedUsd ?? 0;
  try {
    await prisma.$transaction(async (tx) => {
      const inv = await tx.invocation.create({
        data: {
          apiKeyId: input.apiKeyId ?? null,
          userId: input.userId ?? null,
          agentId: input.agentId,
          protocol: input.protocol,
          status: input.status,
          latencyMs: input.latencyMs ?? null,
          taskState: input.taskState ?? null,
          unitsBilled: units,
          billedUsd: billedUsd > 0 ? billedUsd : null,
          errorCode: input.errorCode ?? null,
        },
        select: { id: true },
      });
      await tx.agent.update({ where: { id: input.agentId }, data: { callsCount: { increment: 1 } } });
      if (billedUsd > 0 && input.userId) {
        await tx.ledgerEntry.create({
          data: { userId: input.userId, type: "DEBIT", amountUsd: -billedUsd, invocationId: inv.id },
        });
        await tx.creditBalance.upsert({
          where: { userId: input.userId },
          create: { userId: input.userId, balanceUsd: -billedUsd },
          update: { balanceUsd: { decrement: billedUsd } },
        });
      }
    });
  } catch {
    // metering/billing must never break the gateway path
  }
}

/**
 * Add credits to a user's balance and record the matching ledger entry, atomically.
 * Used for internal grants / admin adjustments now; the Stripe top-up flow will call
 * this with type=TOPUP once wired. Returns the new balance in USD.
 */
export async function grantCredit(
  userId: string,
  amountUsd: number,
  opts: { type?: LedgerType; note?: string; stripeRef?: string } = {}
): Promise<number> {
  const type: LedgerType = opts.type ?? "TOPUP";
  const balance = await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: { userId, type, amountUsd, note: opts.note ?? null, stripeRef: opts.stripeRef ?? null },
    });
    const cb = await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, balanceUsd: amountUsd },
      update: { balanceUsd: { increment: amountUsd } },
    });
    return cb.balanceUsd;
  });
  return Number(balance);
}

/** Current credit balance in USD (0 if no balance row yet). */
export async function getBalance(userId: string): Promise<number> {
  const cb = await prisma.creditBalance.findUnique({ where: { userId } });
  return cb ? Number(cb.balanceUsd) : 0;
}
