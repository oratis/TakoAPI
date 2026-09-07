import { beforeEach, describe, expect, it, vi } from "vitest";

// The credit pre-flight is the only guard between a looping client and an
// arbitrarily negative balance, so it is exercised here against a mocked prisma:
// there is no database in this suite and the read must stay the only DB touch.
const findUnique = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ balanceUsd: unknown } | null>>()
);

vi.mock("@/lib/prisma", () => ({
  prisma: { creditBalance: { findUnique } },
}));

import { checkCreditPreflight, computeBilledUsd, creditFloorUsd, getBalance } from "@/lib/billing";

beforeEach(() => {
  findUnique.mockResolvedValue({ balanceUsd: 0 });
});

describe("computeBilledUsd", () => {
  it("never charges a FREE agent, whatever price is attached to it", () => {
    expect(computeBilledUsd("FREE", 1.5)).toBe(0);
    expect(computeBilledUsd("FREE", 1.5, 100)).toBe(0);
  });

  it("treats a missing price as free rather than throwing", () => {
    expect(computeBilledUsd("PER_CALL", null)).toBe(0);
    expect(computeBilledUsd("PER_CALL", undefined)).toBe(0);
  });

  it("treats an unusable price as free (fails open, not to a NaN charge)", () => {
    expect(computeBilledUsd("PER_CALL", "not a number")).toBe(0);
    expect(computeBilledUsd("PER_CALL", NaN)).toBe(0);
    expect(computeBilledUsd("PER_CALL", Infinity)).toBe(0);
    expect(computeBilledUsd("PER_CALL", {})).toBe(0);
  });

  it("refuses to bill a negative or zero price", () => {
    expect(computeBilledUsd("PER_CALL", -1)).toBe(0);
    expect(computeBilledUsd("PER_CALL", 0)).toBe(0);
  });

  it("bills unitPrice x units", () => {
    expect(computeBilledUsd("PER_CALL", 0.002)).toBe(0.002);
    expect(computeBilledUsd("PER_CALL", 0.002, 3)).toBe(0.006);
    expect(computeBilledUsd("PER_TASK", 1.25, 4)).toBe(5);
  });

  it("accepts a Prisma Decimal (anything Number() can coerce)", () => {
    const decimalLike = { toString: () => "0.25" };
    expect(computeBilledUsd("PER_CALL", decimalLike, 2)).toBe(0.5);
  });

  it("rounds to 6 decimal places, so float error never reaches the ledger", () => {
    // 0.1 * 3 is 0.30000000000000004 in IEEE-754; the ledger must see 0.3.
    expect(computeBilledUsd("PER_TOKEN", 0.1, 3)).toBe(0.3);
    expect(computeBilledUsd("PER_TOKEN", 1 / 3)).toBe(0.333333);
  });

  it("rounds a sub-micro-dollar charge down to zero", () => {
    // Consequence of the 6-dp rounding: per-token prices below 1e-6 bill nothing
    // at units=1. Change this only together with the ledger's own precision.
    expect(computeBilledUsd("PER_TOKEN", 1e-7)).toBe(0);
    expect(computeBilledUsd("PER_TOKEN", 1e-7, 100)).toBe(0.00001);
  });

  it("does not clamp units — a negative unit count credits the caller", () => {
    // Documents a gap rather than endorsing it: the gateway only ever passes
    // units >= 1 today. If a clamp is added, this expectation should become 0.
    expect(computeBilledUsd("PER_TOKEN", 1, -2)).toBe(-2);
  });
});

describe("creditFloorUsd", () => {
  const KEY = "TAKO_CREDIT_FLOOR_USD";

  it("defaults to no overdraft when unset", () => {
    vi.stubEnv(KEY, undefined);
    expect(creditFloorUsd()).toBe(0);
  });

  it("falls back to 0 for a non-numeric or empty value", () => {
    vi.stubEnv(KEY, "abc");
    expect(creditFloorUsd()).toBe(0);
    vi.stubEnv(KEY, "");
    expect(creditFloorUsd()).toBe(0);
  });

  it("accepts a negative floor (tolerating in-flight debits)", () => {
    vi.stubEnv(KEY, "-1");
    expect(creditFloorUsd()).toBe(-1);
    vi.stubEnv(KEY, "-0.5");
    expect(creditFloorUsd()).toBe(-0.5);
  });

  it("accepts a positive floor (requiring headroom)", () => {
    vi.stubEnv(KEY, "2.5");
    expect(creditFloorUsd()).toBe(2.5);
  });
});

describe("getBalance", () => {
  it("is 0 when the user has no balance row yet", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getBalance("u1")).resolves.toBe(0);
  });

  it("coerces the Decimal column to a number", async () => {
    findUnique.mockResolvedValue({ balanceUsd: { toString: () => "12.5" } });
    await expect(getBalance("u1")).resolves.toBe(12.5);
  });
});

describe("checkCreditPreflight", () => {
  it("passes a FREE agent without reading the database", async () => {
    await expect(checkCreditPreflight("u1", "FREE", 5)).resolves.toEqual({ ok: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("passes an unpriced agent without reading the database", async () => {
    await expect(checkCreditPreflight("u1", "PER_CALL", null)).resolves.toEqual({ ok: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("passes an unattributable call — the debit would be skipped anyway", async () => {
    await expect(checkCreditPreflight(null, "PER_CALL", 1)).resolves.toEqual({ ok: true });
    await expect(checkCreditPreflight(undefined, "PER_CALL", 1)).resolves.toEqual({ ok: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("passes when the balance covers the charge", async () => {
    findUnique.mockResolvedValue({ balanceUsd: 10 });
    await expect(checkCreditPreflight("u1", "PER_CALL", 0.5)).resolves.toEqual({ ok: true });
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("rejects when the charge would drop the balance below the floor", async () => {
    findUnique.mockResolvedValue({ balanceUsd: 0.25 });
    await expect(checkCreditPreflight("u1", "PER_CALL", 1)).resolves.toEqual({
      ok: false,
      balanceUsd: 0.25,
      requiredUsd: 1,
      floorUsd: 0,
    });
  });

  it("allows a call that lands exactly on the floor", async () => {
    // The comparison is strictly-less-than: spending down to exactly 0 is allowed.
    findUnique.mockResolvedValue({ balanceUsd: 1 });
    await expect(checkCreditPreflight("u1", "PER_CALL", 1)).resolves.toEqual({ ok: true });
  });

  it("honours a negative floor as overdraft tolerance", async () => {
    vi.stubEnv("TAKO_CREDIT_FLOOR_USD", "-1");
    findUnique.mockResolvedValue({ balanceUsd: 0 });
    await expect(checkCreditPreflight("u1", "PER_CALL", 0.5)).resolves.toEqual({ ok: true });
    await expect(checkCreditPreflight("u1", "PER_CALL", 2)).resolves.toEqual({
      ok: false,
      balanceUsd: 0,
      requiredUsd: 2,
      floorUsd: -1,
    });
  });

  it("honours a positive floor as required headroom", async () => {
    vi.stubEnv("TAKO_CREDIT_FLOOR_USD", "5");
    findUnique.mockResolvedValue({ balanceUsd: 5.25 });
    await expect(checkCreditPreflight("u1", "PER_CALL", 0.5)).resolves.toMatchObject({ ok: false });
  });

  it("fails OPEN when the balance read throws", async () => {
    // Deliberate: a DB blip also blocks the debit, so nothing runs away, and the
    // gateway must not start rejecting paid traffic because Postgres hiccuped.
    // If this ever starts returning ok:false, paid customers get 402s during an
    // outage — do not "fix" it without changing the doc comment in billing.ts.
    findUnique.mockRejectedValue(new Error("connection terminated"));
    await expect(checkCreditPreflight("u1", "PER_CALL", 1)).resolves.toEqual({ ok: true });
  });
});
