import { describe, expect, it, vi } from "vitest";

// hasScope is pure, but the module it lives in pulls in NextAuth and Prisma at
// import time, neither of which can initialise in this suite (there is no database
// and no request context). Stub them so the unit under test can be loaded.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/apikey", () => ({ authenticateApiKey: vi.fn() }));

import { hasScope, type ApiUser } from "@/lib/api-user";

// hasScope is the gate that decides whether a credential reaches the admin API.
// It exists because gateway keys are meant to be handed out — the docs tell users
// to paste one into an MCP client's config — so "an admin made a key to call
// agents" must not read as "this key can change user roles". The asymmetry between
// `admin` and the other scopes is the whole point of the function, so it is pinned
// here: a regression would be silent and would hand out account takeover.

function user(over: Partial<ApiUser> = {}): ApiUser {
  return {
    id: "u1",
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    via: "session",
    scopes: [],
    ...over,
  };
}

describe("hasScope — admin", () => {
  it("refuses a gateway key with no scopes, even when its owner is an admin", () => {
    // Every key /api/keys issues today has an empty scopes array. If empty meant
    // unrestricted here, an admin's ordinary invocation key would be a full admin
    // credential.
    expect(hasScope(user({ role: "admin", via: "apikey", scopes: [] }), "admin")).toBe(false);
  });

  it("refuses a gateway key scoped to something else", () => {
    expect(hasScope(user({ role: "admin", via: "apikey", scopes: ["read", "invoke"] }), "admin")).toBe(false);
  });

  it("allows a gateway key that names the admin scope", () => {
    expect(hasScope(user({ role: "admin", via: "apikey", scopes: ["admin"] }), "admin")).toBe(true);
  });

  it("refuses a scoped key whose owner is not an admin", () => {
    // The scope alone is never enough — the role still has to be there.
    expect(hasScope(user({ role: "user", via: "apikey", scopes: ["admin"] }), "admin")).toBe(false);
  });

  it("allows an admin session", () => {
    expect(hasScope(user({ role: "admin", via: "session" }), "admin")).toBe(true);
  });

  it("refuses a non-admin session", () => {
    expect(hasScope(user({ role: "user", via: "session" }), "admin")).toBe(false);
  });

  it("allows the legacy single-purpose admin key", () => {
    // User.apiKey was only ever issued for this, so it keeps working while it exists.
    expect(hasScope(user({ role: "admin", via: "legacy-apikey" }), "admin")).toBe(true);
  });

  it("refuses a legacy key whose owner is not an admin", () => {
    expect(hasScope(user({ role: "user", via: "legacy-apikey" }), "admin")).toBe(false);
  });
});

describe("hasScope — read / invoke / submit", () => {
  it("treats an unscoped key as unrestricted on the non-admin surface", () => {
    const k = user({ via: "apikey", scopes: [] });
    expect(hasScope(k, "read")).toBe(true);
    expect(hasScope(k, "invoke")).toBe(true);
    expect(hasScope(k, "submit")).toBe(true);
  });

  it("honours an explicit scope list", () => {
    const k = user({ via: "apikey", scopes: ["read"] });
    expect(hasScope(k, "read")).toBe(true);
    expect(hasScope(k, "invoke")).toBe(false);
    expect(hasScope(k, "submit")).toBe(false);
  });

  it("lets any session through, admin or not", () => {
    expect(hasScope(user({ role: "user" }), "invoke")).toBe(true);
    expect(hasScope(user({ role: "admin" }), "submit")).toBe(true);
  });
});
