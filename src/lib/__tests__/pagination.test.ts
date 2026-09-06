import { describe, expect, it } from "vitest";
import { clampPagination } from "@/lib/pagination";

// Every public listing endpoint hands its query string straight to this
// function and then to `take`/`skip`, so an unclamped limit is a trivially
// reachable "SELECT everything" and a negative skip is a Prisma error.

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe("clampPagination — defaults", () => {
  it("uses page 1 and the default limit when nothing is supplied", () => {
    expect(clampPagination(params(""))).toEqual({ page: 1, limit: 24, skip: 0 });
  });

  it("accepts any object exposing get(), not just URLSearchParams", () => {
    const bag = { get: (k: string) => (k === "page" ? "2" : "10") };
    expect(clampPagination(bag)).toEqual({ page: 2, limit: 10, skip: 10 });
  });
});

describe("clampPagination — page", () => {
  it("computes skip from the clamped page and limit", () => {
    expect(clampPagination(params("page=3&limit=10"))).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it("never returns a page below 1, so skip is never negative", () => {
    for (const qs of ["page=0", "page=-5", "page=0.4"]) {
      const p = clampPagination(params(qs));
      expect(p.page).toBe(1);
      expect(p.skip).toBe(0);
    }
  });

  it("falls back to page 1 for junk and non-finite input", () => {
    for (const qs of ["page=abc", "page=", "page=NaN", "page=Infinity", "page=1e400"]) {
      expect(clampPagination(params(qs)).page).toBe(1);
    }
  });

  it("truncates a fractional page rather than rounding", () => {
    expect(clampPagination(params("page=2.9&limit=10"))).toEqual({ page: 2, limit: 10, skip: 10 });
  });
});

describe("clampPagination — limit", () => {
  it("caps the limit so one request cannot pull the whole table", () => {
    expect(clampPagination(params("limit=1000")).limit).toBe(100);
    expect(clampPagination(params("limit=101")).limit).toBe(100);
    expect(clampPagination(params("limit=100")).limit).toBe(100);
  });

  it("raises a zero or negative limit to 1", () => {
    expect(clampPagination(params("limit=0")).limit).toBe(1);
    expect(clampPagination(params("limit=-10")).limit).toBe(1);
  });

  it("falls back to the default limit for junk input", () => {
    expect(clampPagination(params("limit=abc")).limit).toBe(24);
    expect(clampPagination(params("limit=Infinity")).limit).toBe(24);
  });

  it("treats an empty limit as 1, not as the default", () => {
    // Number("") is 0, which is finite, so it takes the clamp path rather than
    // the fallback. Documented because "?limit=" is easy to produce from a form.
    expect(clampPagination(params("limit=")).limit).toBe(1);
  });

  it("truncates a fractional limit", () => {
    expect(clampPagination(params("limit=10.9")).limit).toBe(10);
  });
});

describe("clampPagination — skip stays consistent", () => {
  it("always equals (page - 1) * limit", () => {
    for (const qs of ["page=5&limit=7", "page=1&limit=100", "page=1000&limit=3", "page=-1&limit=0"]) {
      const p = clampPagination(params(qs));
      expect(p.skip).toBe((p.page - 1) * p.limit);
      expect(p.skip).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(p.skip)).toBe(true);
    }
  });
});
