import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// View counting exists to stop bots and link previews inflating viewsCount, and
// its dedupe key is a privacy control (a salted, daily-rotating hash instead of a
// stored IP). Both are asserted here against a mocked prisma — there is no
// database in this suite — and against a mocked extractClientIp, so the test does
// not depend on next/server request internals.
const findFirst = vi.hoisted(() => vi.fn<(args: unknown) => Promise<{ id: string } | null>>());
const createEvent = vi.hoisted(() => vi.fn<(args: unknown) => unknown>());
const deleteMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<{ count: number }>>());
const updateSkill = vi.hoisted(() => vi.fn<(args: unknown) => unknown>());
const transaction = vi.hoisted(() => vi.fn<(ops: unknown[]) => Promise<unknown[]>>());
const extractClientIp = vi.hoisted(() => vi.fn<(req: unknown) => string>());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    skillEvent: { findFirst, create: createEvent, deleteMany },
    skill: { update: updateSkill },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/ratelimit", () => ({ extractClientIp }));

import { pruneSkillViewEvents, recordSkillView } from "@/lib/views";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** A request stub carrying only what recordSkillView reads. */
function req(ua: string | null, ip = "203.0.113.9"): NextRequest {
  const headers = new Headers();
  if (ua !== null) headers.set("user-agent", ua);
  headers.set("x-test-ip", ip);
  return { headers } as unknown as NextRequest;
}

/** The dedupe key handed to the last findFirst call. */
function lastVisitorKey(): string {
  const args = findFirst.mock.calls.at(-1)?.[0] as { where: { referrer: string } };
  return args.where.referrer;
}

beforeEach(() => {
  extractClientIp.mockImplementation(
    (r) => (r as { headers: Headers }).headers.get("x-test-ip") ?? "anon"
  );
  findFirst.mockResolvedValue(null);
  transaction.mockResolvedValue([]);
  deleteMany.mockResolvedValue({ count: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("recordSkillView — bot filter", () => {
  it.each([
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Baiduspider/2.0",
    "curl/8.4.0",
    "Wget/1.21.4",
    "python-requests/2.31.0",
    "Go-http-client/1.1",
    "node-fetch/1.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
    "WhatsApp/2.23 preview",
  ])("does not count %s", async (ua) => {
    await expect(recordSkillView("skill-1", req(ua))).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not count a request with no user agent at all", async () => {
    await expect(recordSkillView("skill-1", req(null))).resolves.toBe(false);
    await expect(recordSkillView("skill-1", req(""))).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("counts a normal browser", async () => {
    for (const ua of [
      CHROME_UA,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    ]) {
      findFirst.mockClear();
      await expect(recordSkillView("skill-1", req(ua))).resolves.toBe(true);
      expect(findFirst).toHaveBeenCalledTimes(1);
    }
  });

  it("still counts facebookexternalhit — a known gap in the pattern", async () => {
    // Documents current behaviour, not a preference: the regex has no term that
    // matches this link-preview fetcher, so previews still inflate viewsCount.
    // If BOT_UA grows to cover it, flip this expectation to false.
    const ua = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
    await expect(recordSkillView("skill-1", req(ua))).resolves.toBe(true);
  });
});

describe("recordSkillView — dedupe", () => {
  it("writes the event and increments the counter for a first view", async () => {
    await expect(recordSkillView("skill-1", req(CHROME_UA))).resolves.toBe(true);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skillId: "skill-1", type: "view" }),
      })
    );
    expect(updateSkill).toHaveBeenCalledWith({
      where: { id: "skill-1" },
      data: { viewsCount: { increment: 1 } },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("does not count a repeat view from the same visitor", async () => {
    findFirst.mockResolvedValue({ id: "existing" });
    await expect(recordSkillView("skill-1", req(CHROME_UA))).resolves.toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it("scopes the dedupe lookup to the skill and the view event type", async () => {
    await recordSkillView("skill-42", req(CHROME_UA));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ skillId: "skill-42", type: "view" }),
      })
    );
  });

  it("swallows a database failure instead of breaking the page", async () => {
    findFirst.mockRejectedValue(new Error("connection terminated"));
    await expect(recordSkillView("skill-1", req(CHROME_UA))).resolves.toBe(false);
  });
});

describe("recordSkillView — visitor key", () => {
  it("is stable for the same visitor and versioned", async () => {
    await recordSkillView("skill-1", req(CHROME_UA));
    const first = lastVisitorKey();
    await recordSkillView("skill-1", req(CHROME_UA));
    expect(lastVisitorKey()).toBe(first);
    expect(first).toMatch(/^v1:[0-9a-f]{32}$/);
  });

  it("does not carry the address or user agent in the clear", async () => {
    await recordSkillView("skill-1", req(CHROME_UA, "203.0.113.9"));
    const key = lastVisitorKey();
    expect(key).not.toContain("203.0.113.9");
    expect(key).not.toContain("Chrome");
  });

  it("separates visitors by address and by user agent", async () => {
    await recordSkillView("skill-1", req(CHROME_UA, "203.0.113.9"));
    const base = lastVisitorKey();
    await recordSkillView("skill-1", req(CHROME_UA, "198.51.100.4"));
    expect(lastVisitorKey()).not.toBe(base);
    await recordSkillView("skill-1", req(`${CHROME_UA} Extra`, "203.0.113.9"));
    expect(lastVisitorKey()).not.toBe(base);
  });

  it("rotates at the UTC day boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T23:59:59Z"));
    await recordSkillView("skill-1", req(CHROME_UA));
    const beforeMidnight = lastVisitorKey();
    vi.setSystemTime(new Date("2026-09-07T00:00:01Z"));
    await recordSkillView("skill-1", req(CHROME_UA));
    expect(lastVisitorKey()).not.toBe(beforeMidnight);
  });

  it("changes with the salt, so the hash cannot be replayed across deployments", async () => {
    vi.stubEnv("TAKO_IP_SALT", "salt-a");
    await recordSkillView("skill-1", req(CHROME_UA));
    const withSaltA = lastVisitorKey();
    vi.stubEnv("TAKO_IP_SALT", "salt-b");
    await recordSkillView("skill-1", req(CHROME_UA));
    expect(lastVisitorKey()).not.toBe(withSaltA);
  });
});

describe("pruneSkillViewEvents", () => {
  it("deletes only view events older than the retention window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    deleteMany.mockResolvedValue({ count: 7 });
    await expect(pruneSkillViewEvents(3)).resolves.toBe(7);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { type: "view", createdAt: { lt: new Date("2026-09-03T12:00:00Z") } },
    });
  });

  it("defaults to a three-day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    await pruneSkillViewEvents();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { type: "view", createdAt: { lt: new Date("2026-09-03T12:00:00Z") } },
    });
  });
});
