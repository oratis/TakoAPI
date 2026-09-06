import { describe, expect, it } from "vitest";
import {
  classifyScenarios,
  findScenario,
  isScenarioSlug,
  MAX_SCENARIOS_PER_AGENT,
  SCENARIOS,
  SCENARIO_SLUGS,
  scenarioLabel,
} from "@/lib/scenarios";

// classifyScenarios runs unattended over scraped GitHub descriptions, so a
// false positive is a mis-filed agent nobody reviews. The word-boundary rules
// are the whole defence against that; they are pinned here with the real
// keywords that would otherwise collide ("rag" in "storage", "orm" in
// "platform", "seo" in "seoul").

describe("classifyScenarios — empty input", () => {
  it("returns nothing for empty, null or undefined text", () => {
    expect(classifyScenarios("")).toEqual([]);
    expect(classifyScenarios(null)).toEqual([]);
    expect(classifyScenarios(undefined)).toEqual([]);
    expect(classifyScenarios("   ")).toEqual([]);
  });

  it("leaves unmatched text unclassified rather than guessing", () => {
    expect(classifyScenarios("a tool for doing the thing you like")).toEqual([]);
  });
});

describe("classifyScenarios — ASCII terms match on word boundaries", () => {
  it("does not find 'rag' inside 'storage'", () => {
    expect(classifyScenarios("cloud storage for your files")).not.toContain("research");
    expect(classifyScenarios("rag pipeline over your docs")).toContain("research");
  });

  it("does not find 'orm' inside 'platform'", () => {
    const hits = classifyScenarios("an agent platform for teams");
    expect(hits).toContain("agent-frameworks");
    expect(hits).not.toContain("backend");
    expect(classifyScenarios("a prisma orm helper")).toContain("backend");
  });

  it("does not find 'seo' inside 'seoul'", () => {
    expect(classifyScenarios("a startup from seoul")).not.toContain("marketing");
    expect(classifyScenarios("seo audits on autopilot")).toContain("marketing");
  });

  it("does not match a keyword that only appears as a prefix of a longer word", () => {
    expect(classifyScenarios("smart home hub")).toEqual([]);
    expect(classifyScenarios("generative artistry studio")).not.toContain("creative");
    expect(classifyScenarios("generative art with diffusion")).toContain("creative");
  });

  it("treats '.' in a keyword literally, not as a wildcard", () => {
    // "next.js" is escaped before compiling, so it must not match "nextxjs".
    expect(classifyScenarios("nextxjs")).toEqual([]);
    expect(classifyScenarios("built with next.js")).toContain("frontend");
  });

  it("matches keywords containing punctuation, e.g. 'ci/cd'", () => {
    expect(classifyScenarios("ci/cd for monorepos")).toContain("devops");
  });

  it("is case-insensitive", () => {
    expect(classifyScenarios("REACT and Tailwind")).toEqual(classifyScenarios("react and tailwind"));
    expect(classifyScenarios("REACT and Tailwind")).toContain("frontend");
  });
});

describe("classifyScenarios — CJK terms match as substrings", () => {
  it("matches Chinese keywords with no surrounding whitespace", () => {
    expect(classifyScenarios("一个前端组件库")).toEqual(["frontend"]);
    expect(classifyScenarios("量化交易策略回测")).toContain("investing");
  });

  it("matches an ASCII keyword that is bounded by CJK characters", () => {
    // CJK code points are non-word characters to \b, so "ppt" is still bounded.
    expect(classifyScenarios("一个做PPT的智能体")).toContain("presentations");
  });
});

describe("classifyScenarios — ranking and cap", () => {
  it("ranks by number of distinct keyword hits", () => {
    const hits = classifyScenarios("react tailwind css app that also deploys to kubernetes");
    expect(hits[0]).toBe("frontend");
    expect(hits).toContain("devops");
  });

  it("breaks ties by taxonomy order and caps the result", () => {
    // Four scenarios tie at two hits each; the cap keeps the first three in
    // taxonomy order and drops investing, which sits last in the taxonomy.
    const hits = classifyScenarios("react tailwind kubernetes docker trading stock ppt slides");
    expect(hits).toEqual(["frontend", "devops", "presentations"]);
    expect(hits.length).toBeLessThanOrEqual(MAX_SCENARIOS_PER_AGENT);
  });

  it("orders a two-way tie by taxonomy position", () => {
    // coding (index 2) before devops (index 4), regardless of word order.
    expect(classifyScenarios("refactor and kubernetes")).toEqual(["coding", "devops"]);
    expect(classifyScenarios("kubernetes and refactor")).toEqual(["coding", "devops"]);
  });

  it("is deterministic", () => {
    const text = "a coding agent that does code review and ci/cd";
    expect(classifyScenarios(text)).toEqual(classifyScenarios(text));
  });

  it("never exceeds the cap even for text that hits everything", () => {
    const everything = SCENARIOS.flatMap((s) => s.keywords).join(" ");
    expect(classifyScenarios(everything).length).toBe(MAX_SCENARIOS_PER_AGENT);
  });
});

describe("isScenarioSlug", () => {
  it("accepts every slug in the taxonomy", () => {
    for (const s of SCENARIOS) expect(isScenarioSlug(s.slug)).toBe(true);
  });

  it("rejects unknown, empty and nullish slugs", () => {
    expect(isScenarioSlug("not-a-scenario")).toBe(false);
    expect(isScenarioSlug("")).toBe(false);
    expect(isScenarioSlug(null)).toBe(false);
    expect(isScenarioSlug(undefined)).toBe(false);
  });

  it("is case-sensitive — slugs come from URLs and must match exactly", () => {
    expect(isScenarioSlug("Frontend")).toBe(false);
  });
});

describe("taxonomy data", () => {
  it("has unique slugs, all present in SCENARIO_SLUGS", () => {
    const slugs = SCENARIOS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(SCENARIO_SLUGS.size).toBe(slugs.length);
  });

  it("gives every scenario at least one keyword and both labels", () => {
    for (const s of SCENARIOS) {
      expect(s.keywords.length).toBeGreaterThan(0);
      expect(s.name).not.toBe("");
      expect(s.nameZh).not.toBe("");
    }
  });

  it("looks up a scenario by slug", () => {
    expect(findScenario("frontend")?.name).toBe("Frontend");
    expect(findScenario("nope")).toBeUndefined();
  });

  it("renders a bilingual label, falling back to the raw slug", () => {
    expect(scenarioLabel("frontend")).toBe("前端开发 · Frontend");
    expect(scenarioLabel("unknown-slug")).toBe("unknown-slug");
  });
});
