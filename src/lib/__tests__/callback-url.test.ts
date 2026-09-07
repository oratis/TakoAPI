import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/callback-url";

// safeCallbackUrl is the open-redirect guard on the sign-in flow: whatever a
// link puts in ?callbackUrl= ends up in a post-auth redirect, so anything that
// can leave the origin has to be rejected here.

describe("safeCallbackUrl — rejects anything that can leave the origin", () => {
  it.each([
    ["absolute https", "https://evil.com/steal"],
    ["absolute http", "http://evil.com"],
    ["protocol-relative", "//evil.com/steal"],
    ["backslash after slash", "/\\evil.com"],
    ["leading backslash", "\\\\evil.com"],
    ["scheme-only", "javascript:alert(1)"],
    ["data URL", "data:text/html,<script>alert(1)</script>"],
    ["relative path with no leading slash", "dashboard"],
  ])("replaces a %s callback with the fallback", (_label, raw) => {
    expect(safeCallbackUrl(raw)).toBe("/");
  });

  it("rejects the auth pages themselves, with or without a locale prefix", () => {
    expect(safeCallbackUrl("/auth/signin")).toBe("/");
    expect(safeCallbackUrl("/auth/signup?x=1")).toBe("/");
    expect(safeCallbackUrl("/en/auth/signin")).toBe("/");
    expect(safeCallbackUrl("/ar/auth/signup")).toBe("/");
    expect(safeCallbackUrl("/zh/auth/error")).toBe("/");
  });
});

describe("safeCallbackUrl — keeps same-origin paths", () => {
  it.each([
    "/",
    "/dashboard",
    "/en/dashboard",
    "/ar/skills/foo-bar",
    "/submit?from=header",
    "/skills?q=a%20b&page=2#results",
  ])("returns %s unchanged", (raw) => {
    expect(safeCallbackUrl(raw)).toBe(raw);
  });

  it("does not over-block paths that merely start with 'auth'", () => {
    // The guard matches the "/auth/" segment, not the prefix, so real content
    // routes are not silently swallowed.
    expect(safeCallbackUrl("/authors/oratis")).toBe("/authors/oratis");
    expect(safeCallbackUrl("/en/authoring-guide")).toBe("/en/authoring-guide");
  });
});

describe("safeCallbackUrl — fallback", () => {
  it("defaults to the home page for missing input", () => {
    expect(safeCallbackUrl(null)).toBe("/");
    expect(safeCallbackUrl(undefined)).toBe("/");
    expect(safeCallbackUrl("")).toBe("/");
  });

  it("uses the caller's fallback when one is supplied", () => {
    expect(safeCallbackUrl(null, "/en/dashboard")).toBe("/en/dashboard");
    expect(safeCallbackUrl("https://evil.com", "/en/dashboard")).toBe("/en/dashboard");
    expect(safeCallbackUrl("/en/auth/signin", "/en/dashboard")).toBe("/en/dashboard");
  });
});
