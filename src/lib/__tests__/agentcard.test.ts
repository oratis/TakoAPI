import { beforeEach, describe, expect, it, vi } from "vitest";

// fetchAgentCard pulls a URL supplied by an untrusted submitter, so its SSRF
// guards are security controls, not hygiene: the string check, the DNS/IP check
// and the per-hop redirect revalidation each close a different path to the cloud
// metadata service. All three are asserted here. DNS is mocked (no network, and
// a rebinding scenario can't be staged against a real resolver) and so is fetch.
const lookupMock = vi.hoisted(() =>
  vi.fn<(hostname: string, opts: { all: true }) => Promise<{ address: string; family: number }[]>>()
);

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { AgentCardError, fetchAgentCard } from "@/lib/agentcard";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const PUBLIC_ADDR = [{ address: "93.184.216.34", family: 4 }];

const VALID_CARD = {
  name: "Weather Agent",
  description: "Forecasts the weather",
  url: "https://agents.example.com/a2a",
  version: "1.2.0",
  capabilities: { streaming: true, pushNotifications: false },
  securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
  skills: [
    {
      id: "forecast",
      name: "Forecast",
      description: "Five-day forecast",
      inputModes: ["text/plain"],
      outputModes: ["application/json"],
      examples: ["weather in Paris"],
    },
  ],
};

function jsonRes(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": "application/json" } });
}

function redirectRes(location: string | null, status = 302): Response {
  const headers = new Headers();
  if (location !== null) headers.set("location", location);
  return new Response(null, { status, headers });
}

/** URLs passed to fetch, in order. */
function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(jsonRes(VALID_CARD));
  lookupMock.mockResolvedValue(PUBLIC_ADDR);
});

describe("fetchAgentCard — URL validation", () => {
  it("refuses a non-http(s) scheme without touching the network", async () => {
    for (const url of ["ftp://example.com/card.json", "file:///etc/passwd", "gopher://x/1"]) {
      await expect(fetchAgentCard(url)).rejects.toThrow(AgentCardError);
      await expect(fetchAgentCard(url)).rejects.toThrow("Only http(s) URLs are allowed");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a javascript: URL", async () => {
    await expect(fetchAgentCard("javascript:alert(1)")).rejects.toThrow(
      "Only http(s) URLs are allowed"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses input that is not a URL at all", async () => {
    for (const url of ["", "not a url", "example.com/card.json"]) {
      await expect(fetchAgentCard(url)).rejects.toThrow("Invalid URL");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchAgentCard — literal private addresses (production)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it.each([
    ["localhost", "http://localhost:8080/card.json"],
    ["loopback", "http://127.0.0.1/card.json"],
    ["unspecified", "http://0.0.0.0/card.json"],
    ["10/8", "http://10.1.2.3/card.json"],
    ["192.168/16", "http://192.168.1.1/card.json"],
    ["172.16/12 low", "http://172.16.0.1/card.json"],
    ["172.16/12 high", "http://172.31.255.255/card.json"],
    ["link-local metadata", "http://169.254.169.254/latest/meta-data"],
  ])("refuses %s before resolving or fetching", async (_label, url) => {
    await expect(fetchAgentCard(url)).rejects.toThrow(
      "Refusing to fetch a private/loopback address"
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("still refuses an IPv6 loopback literal, though only at the DNS layer", async () => {
    // Documents where the two guards divide: URL.hostname keeps the brackets
    // ("[::1]"), so the string comparison against "::1" in assertSafeUrl never
    // fires. The host is then unresolvable, so the fetch is refused anyway —
    // fail-closed, but for a different reason than the message suggests.
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(fetchAgentCard("http://[::1]/card.json")).rejects.toThrow(AgentCardError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an address just outside the private ranges", async () => {
    // 172.32/16 is public; the guard must not over-block the whole 172/8.
    lookupMock.mockResolvedValue([{ address: "172.32.0.1", family: 4 }]);
    await expect(fetchAgentCard("http://172.32.0.1/card.json")).resolves.toMatchObject({
      name: "Weather Agent",
    });
  });

  it("allows private addresses outside production, so local cards still work in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(fetchAgentCard("http://localhost:3000/card.json")).resolves.toMatchObject({
      name: "Weather Agent",
    });
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe("fetchAgentCard — DNS rebinding guard (production)", () => {
  const CARD_URL = "https://public.example.com/card.json";

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it.each([
    ["cloud metadata", { address: "169.254.169.254", family: 4 }],
    ["loopback", { address: "127.0.0.53", family: 4 }],
    ["10/8", { address: "10.0.0.7", family: 4 }],
    ["CGNAT", { address: "100.64.0.1", family: 4 }],
    ["0/8", { address: "0.0.0.0", family: 4 }],
    ["benchmarking", { address: "198.18.0.1", family: 4 }],
    ["IPv6 loopback", { address: "::1", family: 6 }],
    ["IPv6 unique-local", { address: "fd00::1", family: 6 }],
    ["IPv6 link-local", { address: "fe80::1", family: 6 }],
    ["IPv4-mapped metadata", { address: "::ffff:169.254.169.254", family: 6 }],
  ])("refuses a public name that resolves to %s", async (_label, addr) => {
    lookupMock.mockResolvedValue([addr]);
    await expect(fetchAgentCard(CARD_URL)).rejects.toThrow(
      "Refusing to fetch a private/loopback address"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when ANY resolved address is private, not just the first", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(fetchAgentCard(CARD_URL)).rejects.toThrow(
      "Refusing to fetch a private/loopback address"
    );
  });

  it("treats an unparseable resolved address as unsafe", async () => {
    lookupMock.mockResolvedValue([{ address: "not.an.ip.address", family: 4 }]);
    await expect(fetchAgentCard(CARD_URL)).rejects.toThrow(
      "Refusing to fetch a private/loopback address"
    );
  });

  it("refuses when the host does not resolve at all", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(fetchAgentCard(CARD_URL)).rejects.toThrow(
      "Could not resolve public.example.com"
    );
    lookupMock.mockResolvedValue([]);
    await expect(fetchAgentCard(CARD_URL)).rejects.toThrow("did not resolve");
  });

  it("allows a genuinely public address (CGNAT boundary included)", async () => {
    lookupMock.mockResolvedValue([{ address: "100.128.0.1", family: 4 }]);
    await expect(fetchAgentCard(CARD_URL)).resolves.toMatchObject({ name: "Weather Agent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchAgentCard — redirects", () => {
  it("bounds the redirect chain", async () => {
    fetchMock.mockImplementation(async () => redirectRes("https://example.com/next.json"));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "Too many redirects"
    );
    // MAX_REDIRECTS = 3, so the fourth response is the one that trips the limit.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("refuses a redirect without a Location header", async () => {
    fetchMock.mockResolvedValue(redirectRes(null));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "Redirect without a Location header"
    );
  });

  it("resolves a relative Location against the current URL", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectRes("/elsewhere/card.json"))
      .mockResolvedValueOnce(jsonRes(VALID_CARD));
    await expect(fetchAgentCard("https://example.com/card.json")).resolves.toMatchObject({
      name: "Weather Agent",
    });
    expect(requestedUrls()).toEqual([
      "https://example.com/card.json",
      "https://example.com/elsewhere/card.json",
    ]);
  });

  it("keeps the originally requested URL as cardUrl across a redirect", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectRes("https://cdn.example.net/served.json"))
      .mockResolvedValueOnce(jsonRes(VALID_CARD));
    const card = await fetchAgentCard("https://example.com/card.json");
    expect(card.cardUrl).toBe("https://example.com/card.json");
  });

  it("refuses a redirect that points into a private address (production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockResolvedValueOnce(redirectRes("http://169.254.169.254/latest/meta-data"));
    await expect(fetchAgentCard("https://public.example.com/card.json")).rejects.toThrow(
      "Refusing to fetch a private/loopback address"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-resolves every hop rather than trusting the first host (production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchMock
      .mockResolvedValueOnce(redirectRes("https://second.example.com/card.json"))
      .mockResolvedValueOnce(jsonRes(VALID_CARD));
    await fetchAgentCard("https://first.example.com/card.json");
    expect(lookupMock.mock.calls.map((c) => c[0])).toEqual([
      "first.example.com",
      "second.example.com",
    ]);
  });
});

describe("fetchAgentCard — response handling", () => {
  it("reports a non-2xx status", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, 500));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "AgentCard fetch returned HTTP 500"
    );
  });

  it("reports an unreachable host", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "Could not reach https://example.com/card.json"
    );
  });

  it("rejects a body that is not JSON", async () => {
    fetchMock.mockResolvedValue(jsonRes("<html>nope</html>"));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "AgentCard is not valid JSON"
    );
  });

  it("rejects JSON that is not an A2A AgentCard", async () => {
    fetchMock.mockResolvedValue(jsonRes({ description: "no name field" }));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "Not a valid A2A AgentCard"
    );
  });

  it("rejects an oversized body", async () => {
    // MAX_BYTES = 256 KiB; a submitter must not be able to make us buffer more.
    fetchMock.mockResolvedValue(jsonRes("x".repeat(300 * 1024)));
    await expect(fetchAgentCard("https://example.com/card.json")).rejects.toThrow(
      "AgentCard response too large"
    );
  });
});

describe("fetchAgentCard — well-known probing", () => {
  it("fetches a direct .json URL as-is, with no probing", async () => {
    await fetchAgentCard("https://example.com/custom/card.json");
    expect(requestedUrls()).toEqual(["https://example.com/custom/card.json"]);
  });

  it("probes the canonical well-known path first for an origin URL", async () => {
    await fetchAgentCard("https://example.com");
    expect(requestedUrls()).toEqual(["https://example.com/.well-known/agent-card.json"]);
  });

  it("falls back to the legacy well-known path", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, 404))
      .mockResolvedValueOnce(jsonRes(VALID_CARD));
    await expect(fetchAgentCard("https://example.com/some/page")).resolves.toMatchObject({
      name: "Weather Agent",
    });
    expect(requestedUrls()).toEqual([
      "https://example.com/.well-known/agent-card.json",
      "https://example.com/.well-known/agent.json",
    ]);
  });

  it("surfaces the last error when every candidate fails", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, 404));
    await expect(fetchAgentCard("https://example.com")).rejects.toThrow(
      "AgentCard fetch returned HTTP 404"
    );
  });
});

describe("fetchAgentCard — normalization", () => {
  it("maps a full card onto the storage shape", async () => {
    const card = await fetchAgentCard("https://example.com/card.json");
    expect(card).toEqual({
      name: "Weather Agent",
      description: "Forecasts the weather",
      endpointUrl: "https://agents.example.com/a2a",
      cardUrl: "https://example.com/card.json",
      streaming: true,
      pushNotify: false,
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      skills: [
        {
          skillKey: "forecast",
          name: "Forecast",
          description: "Five-day forecast",
          inputModes: ["text/plain"],
          outputModes: ["application/json"],
          examples: ["weather in Paris"],
        },
      ],
    });
  });

  it("falls back to the card's own origin when the card omits a service URL", async () => {
    fetchMock.mockResolvedValue(jsonRes({ name: "Minimal" }));
    const card = await fetchAgentCard("https://example.com/deep/path/card.json");
    expect(card.endpointUrl).toBe("https://example.com");
    expect(card.description).toBe("");
    expect(card.streaming).toBe(false);
    expect(card.pushNotify).toBe(false);
    expect(card.securitySchemes).toBeNull();
    expect(card.skills).toEqual([]);
  });

  it("defaults the optional parts of a skill", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ name: "S", skills: [{ id: "k", name: "Only required fields" }] })
    );
    const card = await fetchAgentCard("https://example.com/card.json");
    expect(card.skills).toEqual([
      {
        skillKey: "k",
        name: "Only required fields",
        description: null,
        inputModes: [],
        outputModes: [],
        examples: [],
      },
    ]);
  });

  it("ignores unknown card fields instead of failing the import", async () => {
    fetchMock.mockResolvedValue(jsonRes({ ...VALID_CARD, provider: { org: "ACME" }, extra: 1 }));
    await expect(fetchAgentCard("https://example.com/card.json")).resolves.toMatchObject({
      name: "Weather Agent",
    });
  });
});
