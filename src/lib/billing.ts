import { prisma } from "@/lib/prisma";
import type { AgentProtocol, LedgerType, PricingModel } from "@prisma/client";

// Phase 3 billing — metering + prepaid-credit ledger. The gateway records every
// call and, when it has a cost, debits the caller's balance against an immutable
// ledger. PayPal top-up (src/lib/paypal.ts + /api/billing/topup) credits balances
// via `grantCredit`; internal grants/admin adjustments use it too.
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

/** True when this input actually moves money (and so must not be fire-and-forget). */
function isBilled(input: MeterInput): boolean {
  return (input.billedUsd ?? 0) > 0 && !!input.userId;
}

/**
 * Write the Invocation row, bump the agent's call count, and — when the call has a
 * cost — write the matching DEBIT ledger entry and decrement the caller's credit
 * balance, all in a single transaction so the ledger and balance stay consistent.
 *
 * Rejects on failure. Callers decide whether that's fatal; see `debitInvocation`
 * (money path, awaited) and `meterInvocation` (telemetry, fire-and-forget).
 */
async function writeInvocation(input: MeterInput): Promise<void> {
  const units = input.units ?? 1;
  const billedUsd = input.billedUsd ?? 0;
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
}

/**
 * The money path: record + charge one billed invocation. **Callers must `await`
 * this before returning the gateway response.**
 *
 * Why awaiting matters: Cloud Run allocates CPU per request by default, so a
 * promise still pending when the response is flushed is not guaranteed to run —
 * the instance can be throttled or reclaimed and the debit disappears together
 * with its Invocation row (both live in one transaction). Every such loss is
 * revenue served for free with no record of it. Awaiting costs one Cloud SQL
 * round-trip (unix socket, single-digit ms) and makes the charge deterministic.
 *
 * Never throws — a failed debit must not turn a served call into a 500 — but,
 * unlike the old silent `catch {}`, it logs so the loss is visible in Cloud
 * Logging instead of vanishing.
 */
export async function debitInvocation(input: MeterInput): Promise<void> {
  try {
    await writeInvocation(input);
  } catch (err) {
    console.error("[billing] debit failed — call served but not charged", {
      agentId: input.agentId,
      userId: input.userId ?? null,
      apiKeyId: input.apiKeyId ?? null,
      billedUsd: input.billedUsd ?? 0,
      status: input.status,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Telemetry path: record an invocation that costs nothing (rejected, failed, or a
 * FREE/unpriced agent). Safe to fire-and-forget — losing one of these loses a data
 * point, not money.
 *
 * If handed a billed input anyway it delegates to `debitInvocation`, so a caller
 * that forgets the distinction still charges correctly; the caller is just not
 * awaiting, which is the hazard this split exists to remove.
 */
export async function meterInvocation(input: MeterInput): Promise<void> {
  if (isBilled(input)) return debitInvocation(input);
  try {
    await writeInvocation(input);
  } catch (err) {
    console.error("[billing] metering failed", {
      agentId: input.agentId,
      status: input.status,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Open an Invocation row for a *streaming* call, before any bytes are relayed.
 *
 * A stream cannot be priced when its headers arrive — the upstream can still fail,
 * time out, or return nothing — but if we waited until it ended to record anything
 * at all, a stream cut short would leave no trace and the success rate computed
 * from `Invocation` would silently exclude its own failures. So the row is created
 * up front, unpriced (`billedUsd = null`), and `settleInvocation` finishes it.
 *
 * Returns the row id, or null when the write failed — `settleInvocation` falls back
 * to creating the row at the end in that case. Never throws.
 */
export async function startInvocation(input: MeterInput): Promise<string | null> {
  try {
    const inv = await prisma.$transaction(async (tx) => {
      const created = await tx.invocation.create({
        data: {
          apiKeyId: input.apiKeyId ?? null,
          userId: input.userId ?? null,
          agentId: input.agentId,
          protocol: input.protocol,
          status: input.status,
          latencyMs: input.latencyMs ?? null,
          taskState: input.taskState ?? null,
          unitsBilled: input.units ?? 1,
          billedUsd: null,
          errorCode: input.errorCode ?? null,
        },
        select: { id: true },
      });
      await tx.agent.update({ where: { id: input.agentId }, data: { callsCount: { increment: 1 } } });
      return created;
    });
    return inv.id;
  } catch (err) {
    console.error("[billing] failed to open streaming invocation", {
      agentId: input.agentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Close out a streaming invocation once the stream actually terminates: final
 * status, latency and errorCode, plus — when the stream completed successfully —
 * the DEBIT ledger entry and balance decrement, in one transaction.
 *
 * Updates the row opened by `startInvocation` rather than writing a second one, so
 * a stream is still exactly one Invocation and one `callsCount` increment. When the
 * opening write failed (`invocationId === null`) it falls back to `debitInvocation`,
 * which creates the row from scratch.
 *
 * Never throws. Note this runs *after* the response headers were flushed, so on
 * Cloud Run it needs CPU that is only guaranteed with `--no-cpu-throttling`.
 */
export async function settleInvocation(
  invocationId: string | null,
  input: MeterInput
): Promise<void> {
  if (!invocationId) return debitInvocation(input);
  const billedUsd = input.billedUsd ?? 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.invocation.update({
        where: { id: invocationId },
        data: {
          status: input.status,
          latencyMs: input.latencyMs ?? null,
          taskState: input.taskState ?? null,
          unitsBilled: input.units ?? 1,
          billedUsd: billedUsd > 0 ? billedUsd : null,
          errorCode: input.errorCode ?? null,
        },
      });
      if (billedUsd > 0 && input.userId) {
        await tx.ledgerEntry.create({
          data: {
            userId: input.userId,
            type: "DEBIT",
            amountUsd: -billedUsd,
            invocationId,
          },
        });
        await tx.creditBalance.upsert({
          where: { userId: input.userId },
          create: { userId: input.userId, balanceUsd: -billedUsd },
          update: { balanceUsd: { decrement: billedUsd } },
        });
      }
    });
  } catch (err) {
    console.error("[billing] failed to settle streaming invocation", {
      invocationId,
      agentId: input.agentId,
      userId: input.userId ?? null,
      billedUsd,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Add credits to a user's balance and record the matching ledger entry, atomically.
 * Used by the PayPal top-up capture (type=TOPUP) and for internal grants / admin
 * adjustments. Returns the new balance in USD.
 */
export async function grantCredit(
  userId: string,
  amountUsd: number,
  opts: { type?: LedgerType; note?: string; providerRef?: string } = {}
): Promise<number> {
  const type: LedgerType = opts.type ?? "TOPUP";
  const balance = await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: { userId, type, amountUsd, note: opts.note ?? null, providerRef: opts.providerRef ?? null },
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

/**
 * Lowest credit balance (USD) a user may reach before billed calls are rejected.
 * Default 0 — no overdraft. Set TAKO_CREDIT_FLOOR_USD negative to tolerate a small
 * float (e.g. "-1" absorbs concurrent/in-flight debits that slip past zero), or
 * positive to require headroom. Unset / non-numeric → 0.
 */
export function creditFloorUsd(): number {
  const n = Number(process.env.TAKO_CREDIT_FLOOR_USD);
  return Number.isFinite(n) ? n : 0;
}

export type CreditCheck =
  | { ok: true }
  | { ok: false; balanceUsd: number; requiredUsd: number; floorUsd: number };

/**
 * Pre-flight credit gate for the gateway, run BEFORE the upstream call. FREE agents
 * and zero-price calls pass without touching the DB. For a billed call it loads the
 * caller's balance and rejects when charging it would drop the balance below the
 * configured floor.
 *
 * This is the guard `debitInvocation` can't be: the debit lands *after* the upstream
 * call and lets the balance go negative — so without this check a looping client (or
 * an LLM via the MCP `invoke_agent` tool) could run a balance arbitrarily negative.
 * Callers should return 402 when `ok` is false.
 *
 * Fails open: a balance-read error allows the call. A DB outage also blocks the debit,
 * so no runaway balance accrues, and the gateway is never hard-failed by this check.
 *
 * Residual race: metering is async, so a burst of concurrent calls can each read the
 * same balance and pass before any debit lands. The shared rate limiter bounds that
 * concurrency; widen the floor if you want extra tolerance.
 */
export async function checkCreditPreflight(
  userId: string | null | undefined,
  pricingModel: PricingModel,
  unitPriceUsd: unknown
): Promise<CreditCheck> {
  const requiredUsd = computeBilledUsd(pricingModel, unitPriceUsd);
  if (requiredUsd <= 0) return { ok: true }; // FREE or unpriced — nothing to bill
  if (!userId) return { ok: true }; // unattributable; meterInvocation skips the debit too
  const floorUsd = creditFloorUsd();
  try {
    const balanceUsd = await getBalance(userId);
    if (balanceUsd - requiredUsd < floorUsd) {
      return { ok: false, balanceUsd, requiredUsd, floorUsd };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
