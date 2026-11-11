import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const stubs = vi.hoisted(() => ({ agent: vi.fn(), meter: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { agent: { findFirst: stubs.agent } } }));
vi.mock("@/lib/apikey", () => ({
  authenticateApiKey: async () => ({ id: "key", userId: "caller" }),
  gatewayRateLimit: () => 120,
  newRpcId: () => "rpc-id",
}));
vi.mock("@/lib/ratelimit", () => ({ checkRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/billing", () => ({
  checkCreditPreflight: async () => ({ ok: true }),
  computeBilledUsd: () => 0,
  meterInvocation: stubs.meter,
  debitInvocation: vi.fn(),
}));

function send() {
  const req = new NextRequest("https://takoapi.example/v1/agents/demo/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tako-Free-Only": "1" },
    body: JSON.stringify({ text: "Hello" }),
  });
  return POST(req, { params: Promise.resolve({ slug: "demo" }) });
}

describe("first gateway call", () => {
  it("declines a newly priced agent before contacting it", async () => {
    stubs.agent.mockResolvedValue({ id: "demo", endpointUrl: "https://agent.example", pricingModel: "PER_CALL", unitPriceUsd: 1 });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await send()).status).toBe(409);
    expect(upstream).not.toHaveBeenCalled();
    expect(stubs.meter).not.toHaveBeenCalled();
  });

  it("makes the free invocation visible to a usage read after the response", async () => {
    stubs.agent.mockResolvedValue({ id: "demo", endpointUrl: "https://agent.example", pricingModel: "FREE", unitPriceUsd: null });
    const result = { jsonrpc: "2.0", id: "rpc-id", result: { kind: "message", parts: [{ kind: "text", text: "Hello" }] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    let metered = false;
    stubs.meter.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      metered = true;
    });
    const response = await send();
    expect(metered).toBe(true);
    expect(await response.json()).toEqual(result);
  });
});
