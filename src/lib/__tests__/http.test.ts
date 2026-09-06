import { describe, expect, it } from "vitest";
import { CATALOG_CACHE_HEADERS, NO_STORE_HEADERS, PUBLIC_CACHE_HEADERS } from "@/lib/http";

// These three constants decide what the CDN is allowed to keep. Widening one by
// accident would put a per-user response in a shared cache, so they are pinned
// here as a change detector: editing a value should be a deliberate act that
// updates this test too.

function directives(header: { "Cache-Control": string }): string[] {
  return header["Cache-Control"].split(",").map((d) => d.trim());
}

describe("PUBLIC_CACHE_HEADERS", () => {
  it("is shareable, revalidated by the browser, and cached 60s at the edge", () => {
    expect(directives(PUBLIC_CACHE_HEADERS)).toEqual([
      "public",
      "max-age=0",
      "s-maxage=60",
      "stale-while-revalidate=300",
    ]);
  });
});

describe("CATALOG_CACHE_HEADERS", () => {
  it("holds catalog listings longer than a generic public response", () => {
    expect(directives(CATALOG_CACHE_HEADERS)).toEqual([
      "public",
      "max-age=0",
      "s-maxage=300",
      "stale-while-revalidate=900",
    ]);
  });

  it("keeps max-age at 0 so a browser never serves a stale catalog on its own", () => {
    expect(directives(CATALOG_CACHE_HEADERS)).toContain("max-age=0");
  });
});

describe("NO_STORE_HEADERS", () => {
  it("marks per-user responses private and uncacheable", () => {
    expect(directives(NO_STORE_HEADERS)).toEqual(["private", "no-store"]);
  });

  it("never claims to be public or shareable", () => {
    const cc = NO_STORE_HEADERS["Cache-Control"];
    expect(cc).not.toMatch(/\bpublic\b/);
    expect(cc).not.toMatch(/s-maxage/);
  });
});

describe("the public header sets", () => {
  it("never leak a private response into a shared cache", () => {
    for (const h of [PUBLIC_CACHE_HEADERS, CATALOG_CACHE_HEADERS]) {
      expect(h["Cache-Control"]).not.toMatch(/\bprivate\b/);
      expect(h["Cache-Control"]).not.toMatch(/no-store/);
    }
  });
});
