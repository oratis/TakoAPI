/**
 * Notify open-source repos that they're listed in the TakoAPI agent directory by
 * opening a PR that adds a small "Listed on TakoAPI" README badge linking back to
 * their /agents/{slug} page (a courtesy + backlink for SEO).
 *
 *   # Preview the vetted target list + badge plan (no writes):
 *   npx tsx scripts/notify-listed-repos.ts --limit=30
 *
 *   # Actually fork + open PRs (paced, idempotent via the ledger):
 *   npx tsx scripts/notify-listed-repos.ts --send --limit=1     # first live PR
 *   npx tsx scripts/notify-listed-repos.ts --send --limit=30    # the batch
 *
 *   # Target/retry a specific repo (skips the star/watcher vetting):
 *   npx tsx scripts/notify-listed-repos.ts --send --only=owner/repo
 *
 * TARGETING: the live /api/registry is capped + ordered by recency, which hides
 * the real high-star repos and surfaces a band of star-farmed/flagged ones. So we
 * source from the stars-sorted catalog page (/agents?sort=stars&kind=PROJECT) and
 * VET each repo against GitHub: skip archived, skip the <MIN-star junk band, skip
 * >MAX-star mega-repos (they treat badge PRs as spam), require real watchers.
 *
 * Auth: `gh auth token` (account oratis). Re-runnable: scripts/notify-ledger.json
 * records every repo already handled so a repeat run never double-PRs. Respectful:
 * markdown READMEs only, opt-out wording in the PR body.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = process.env.SITE_URL || "https://takoapi.com";
const LEDGER = join(process.cwd(), "scripts", "notify-ledger.json");
const BRANCH = "add-takoapi-badge";
const ME = "oratis";

// Vetting thresholds (mid-tier real repos): exclude the star-farmed junk band
// (~340★) and the mega-repos, and require genuine watchers.
const STAR_MIN = Number(process.env.STAR_MIN || 800);
const STAR_MAX = Number(process.env.STAR_MAX || 8000);
const WATCH_MIN = Number(process.env.WATCH_MIN || 10);
const CANDIDATE_PAGES = Number(process.env.CANDIDATE_PAGES || 12);

const SEND = process.argv.includes("--send");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 30);
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const PACE_MS = Number(process.env.PACE_MS || 20_000); // gap between repos in --send mode

const TOKEN = (() => {
  try {
    return execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    console.error("Could not get a GitHub token via `gh auth token`. Run `gh auth login` first.");
    process.exit(1);
  }
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GhRes = { status: number; data: any; headers: Headers };

async function gh(method: string, path: string, body?: unknown): Promise<GhRes> {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${TOKEN}`,
        "User-Agent": "takoapi-notify",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "1");
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      const reset = Number(res.headers.get("x-ratelimit-reset") || 0);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : reset > 0 ? Math.max(0, reset * 1000 - Date.now()) + 1000 : 60_000;
      if (attempt < 4) {
        console.log(`  rate limited (${res.status}); waiting ${Math.ceil(Math.min(waitMs, 120_000) / 1000)}s…`);
        await sleep(Math.min(waitMs, 120_000));
        continue;
      }
    }
    let data: any = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (res.status === 200 && remaining <= 1) {
      const reset = Number(res.headers.get("x-ratelimit-reset") || 0);
      if (reset > 0) await sleep(Math.min(Math.max(0, reset * 1000 - Date.now()) + 1000, 120_000));
    }
    return { status: res.status, data, headers: res.headers };
  }
  return { status: 0, data: null, headers: new Headers() };
}

const BADGE_MARKERS = [/takoapi\.com\/agents\//i, /Listed%20on-TakoAPI/i, /Listed on TakoAPI/i];

function badgeFor(slug: string): string {
  return `[![Listed on TakoAPI](https://img.shields.io/badge/Listed%20on-TakoAPI-7c3aed)](${SITE}/agents/${slug})`;
}

function insertBadge(readme: string, slug: string): { changed: boolean; reason: string; content: string } {
  if (BADGE_MARKERS.some((re) => re.test(readme))) return { changed: false, reason: "already-listed", content: readme };
  const badge = badgeFor(slug);
  const lines = readme.split("\n");
  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (h1 === -1) return { changed: true, reason: "prepended", content: `${badge}\n\n${readme}` };
  const before = lines.slice(0, h1 + 1);
  let rest = lines.slice(h1 + 1);
  while (rest.length && rest[0].trim() === "") rest = rest.slice(1);
  return { changed: true, reason: "after-h1", content: [...before, "", badge, "", ...rest].join("\n") };
}

function prBody(name: string, slug: string): string {
  return [
    `Hi! 👋 **${name}** is listed in the [TakoAPI](${SITE}) open agent directory — a free, open catalog that helps people discover AI-agent projects ("one API to discover all agents").`,
    ``,
    `Your listing: ${SITE}/agents/${slug}`,
    ``,
    `This PR adds a small badge near the top of the README that links back to that listing, so visitors can find the directory entry. It's entirely optional — if you'd prefer not to include it, just close this PR (no hard feelings, and apologies for the noise).`,
    ``,
    `No tracking and no obligations. Thanks for building ${name}! 🙏`,
  ].join("\n");
}

type Cand = { slug: string; owner: string; repo: string };
type Ledger = { repos: Record<string, { slug: string; status: string; prUrl?: string; date: string }> };

function loadLedger(): Ledger {
  if (existsSync(LEDGER)) {
    try {
      return JSON.parse(readFileSync(LEDGER, "utf8"));
    } catch {
      /* fall through */
    }
  }
  return { repos: {} };
}
function record(ledger: Ledger, key: string, entry: Ledger["repos"][string]) {
  ledger.repos[key] = entry;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
}

// Scrape the stars-sorted catalog page for PROJECT repos (owner/repo + slug), in
// rank order. Robust to attribute ordering; stops when a page has no project cards.
async function collectCandidates(maxPages: number): Promise<Cand[]> {
  const seen = new Set<string>();
  const out: Cand[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${SITE}/agents?kind=PROJECT&sort=stars&page=${page}`);
    if (!res.ok) break;
    const html = await res.text();
    let found = 0;
    for (const c of html.split(/href="\/agents\//).slice(1)) {
      const slug = (c.match(/^([a-z0-9-]+)"/) || [])[1];
      const or = (c.match(/text-gray-400 truncate">\s*([^<]+?\/[^<]+?)\s*<\/span>/) || [])[1];
      if (!slug || !or) continue;
      const [owner, repo] = or.split("/");
      if (!owner || !repo) continue;
      const key = `${owner}/${repo}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ slug, owner, repo });
      found++;
    }
    if (found === 0) break;
    await sleep(400);
  }
  return out;
}

type Vet = { ok: boolean; reason: string; defaultBranch?: string; stars?: number; watchers?: number };

async function vet(t: Cand): Promise<Vet> {
  if (t.owner.toLowerCase() === ME) return { ok: false, reason: "own-repo" };
  const info = await gh("GET", `/repos/${t.owner}/${t.repo}`);
  if (info.status !== 200) return { ok: false, reason: `repo-${info.status}` };
  const d = info.data;
  const stars = d.stargazers_count ?? 0;
  const watchers = d.subscribers_count ?? 0;
  if (d.archived) return { ok: false, reason: "archived" };
  if (ONLY) return { ok: true, reason: `forced(${stars}★)`, defaultBranch: d.default_branch, stars, watchers };
  if (stars < STAR_MIN) return { ok: false, reason: `stars<${STAR_MIN}(${stars})` };
  if (stars > STAR_MAX) return { ok: false, reason: `mega(${stars})` };
  if (watchers < WATCH_MIN) return { ok: false, reason: `star-farm?(${watchers}w/${stars}★)` };
  return { ok: true, reason: `${stars}★ ${watchers}w`, defaultBranch: d.default_branch, stars, watchers };
}

async function openPr(t: Cand, defaultBranch: string): Promise<{ outcome: string; prUrl?: string }> {
  const rm = await gh("GET", `/repos/${t.owner}/${t.repo}/readme`);
  if (rm.status !== 200) return { outcome: "skip:no-readme" };
  const path: string = rm.data.path;
  if (!/\.(md|markdown)$/i.test(path)) return { outcome: `skip:readme-not-md(${path})` };
  const original = Buffer.from(rm.data.content, "base64").toString("utf8");
  if (!insertBadge(original, t.slug).changed) return { outcome: "skip:already-listed" };

  // 1) fork
  const fork = await gh("POST", `/repos/${t.owner}/${t.repo}/forks`);
  if (fork.status !== 202 && fork.status !== 200) return { outcome: `error:fork-${fork.status}` };
  const forkFull: string = fork.data.full_name;

  // 2) wait until the fork's default branch is ready
  let baseSha: string | null = null;
  for (let i = 0; i < 20; i++) {
    const ref = await gh("GET", `/repos/${forkFull}/git/ref/heads/${defaultBranch}`);
    if (ref.status === 200) {
      baseSha = ref.data.object.sha;
      break;
    }
    await sleep(3000);
  }
  if (!baseSha) return { outcome: "error:fork-not-ready" };

  // 3) create the working branch (ok if it already exists)
  await gh("POST", `/repos/${forkFull}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: baseSha });

  // 4) read the file from the fork branch for the authoritative sha + content
  const fc = await gh("GET", `/repos/${forkFull}/contents/${path}?ref=${BRANCH}`);
  const fileSha: string = fc.status === 200 ? fc.data.sha : rm.data.sha;
  const baseContent = fc.status === 200 ? Buffer.from(fc.data.content, "base64").toString("utf8") : original;
  const ins = insertBadge(baseContent, t.slug);
  if (!ins.changed) return { outcome: "skip:already-listed" };

  // 5) commit the badge to the fork branch
  const put = await gh("PUT", `/repos/${forkFull}/contents/${path}`, {
    message: "docs: add TakoAPI directory badge",
    content: Buffer.from(ins.content, "utf8").toString("base64"),
    sha: fileSha,
    branch: BRANCH,
  });
  if (put.status !== 200 && put.status !== 201)
    return { outcome: `error:put-${put.status}:${JSON.stringify(put.data).slice(0, 100)}` };

  // 6) open the PR upstream — retry the propagation race (fork head not yet visible)
  for (let attempt = 0; attempt < 4; attempt++) {
    const pr = await gh("POST", `/repos/${t.owner}/${t.repo}/pulls`, {
      title: "docs: add TakoAPI directory badge",
      head: `${ME}:${BRANCH}`,
      base: defaultBranch,
      body: prBody(t.repo, t.slug),
      maintainer_can_modify: true,
    });
    if (pr.status === 201) return { outcome: "pr-opened", prUrl: pr.data.html_url };
    if (pr.status === 422 && JSON.stringify(pr.data).includes("already exists"))
      return { outcome: "skip:pr-exists" };
    if (pr.status === 404 && attempt < 3) {
      await sleep(5000);
      continue;
    }
    // Persistent 404 = flagged/restricted upstream; record so we don't retry forever.
    if (pr.status === 404) return { outcome: "skip:pr-unavailable(flagged?)" };
    return { outcome: `error:pr-${pr.status}:${JSON.stringify(pr.data).slice(0, 120)}` };
  }
  return { outcome: "error:pr-retries-exhausted" };
}

async function main() {
  console.log(`mode: ${SEND ? "SEND (will fork + open PRs)" : "DRY-RUN (no writes)"} | target PRs: ${LIMIT}`);
  console.log(`vetting: ${STAR_MIN}–${STAR_MAX}★, ≥${WATCH_MIN} watchers, markdown README, not archived\n`);
  const ledger = loadLedger();

  let candidates: Cand[];
  if (ONLY) {
    const [owner, repo] = ONLY.split("/");
    candidates = [{ owner, repo, slug: "" }];
  } else {
    candidates = await collectCandidates(CANDIDATE_PAGES);
    console.log(`collected ${candidates.length} PROJECT candidates from the stars-sorted catalog.\n`);
  }

  // Vet + select up to LIMIT, in rank order, skipping already-handled repos.
  const selected: { t: Cand; vet: Vet }[] = [];
  for (const t of candidates) {
    if (selected.length >= LIMIT) break;
    const key = `${t.owner}/${t.repo}`;
    if (ledger.repos[key]) continue; // handled in a previous run
    const v = await vet(t);
    if (!v.ok) {
      if (process.env.VERBOSE) console.log(`  - skip ${key}: ${v.reason}`);
      continue;
    }
    if (ONLY && !t.slug) {
      // resolve slug for --only from the deterministic scraper rule
      t.slug = `${t.owner}-${t.repo}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
    }
    selected.push({ t, vet: v });
  }

  console.log(`selected ${selected.length} target(s):`);
  for (const s of selected) console.log(`  ${`${s.t.owner}/${s.t.repo}`.padEnd(42)} ${s.vet.reason.padEnd(14)} -> /agents/${s.t.slug}`);
  console.log("");

  if (!SEND) {
    console.log("DRY-RUN — re-run with --send to fork + open PRs. Badge that will be added:");
    if (selected[0]) console.log(`  ${badgeFor(selected[0].t.slug)}`);
    return;
  }

  const results: { repo: string; outcome: string; prUrl?: string }[] = [];
  let opened = 0;
  for (let i = 0; i < selected.length; i++) {
    const { t, vet: v } = selected[i];
    const key = `${t.owner}/${t.repo}`;
    console.log(`[${i + 1}/${selected.length}] ${key}  (${v.reason})  → /agents/${t.slug}`);
    let r;
    try {
      r = await openPr(t, v.defaultBranch!);
    } catch (e) {
      r = { outcome: `error:exception-${String(e).slice(0, 80)}` };
    }
    console.log(`    → ${r.outcome}${r.prUrl ? "  " + r.prUrl : ""}`);
    results.push({ repo: key, outcome: r.outcome, prUrl: r.prUrl });
    if (r.outcome === "pr-opened") opened++;
    if (r.outcome === "pr-opened" || r.outcome.startsWith("skip:"))
      record(ledger, key, { slug: t.slug, status: r.outcome, prUrl: r.prUrl, date: new Date().toISOString() });
    if (i < selected.length - 1) await sleep(PACE_MS);
  }

  const prs = results.filter((r) => r.outcome === "pr-opened");
  const skipped = results.filter((r) => r.outcome.startsWith("skip:"));
  const errors = results.filter((r) => r.outcome.startsWith("error:"));
  console.log(`\n── summary ──`);
  console.log(`processed: ${results.length} | PRs opened: ${prs.length} | skipped: ${skipped.length} | errors: ${errors.length}`);
  if (prs.length) console.log(`\nPRs:\n${prs.map((o) => `  ${o.repo}  ${o.prUrl}`).join("\n")}`);
  if (skipped.length) console.log(`\nskipped:\n${skipped.map((s) => `  ${s.repo}  ${s.outcome}`).join("\n")}`);
  if (errors.length) console.log(`\nerrors:\n${errors.map((e) => `  ${e.repo}  ${e.outcome}`).join("\n")}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
