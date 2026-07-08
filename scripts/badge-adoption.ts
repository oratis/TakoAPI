/**
 * Badge adoption report for the "Listed on TakoAPI" campaign. Two signals:
 *
 *  1) Outreach funnel — reads scripts/notify-ledger.json and checks each opened
 *     PR's live state (merged / open / closed) via the GitHub API.
 *  2) Footprint — GitHub code-search for repos whose README links back to the
 *     directory (takoapi.com/agents, or the /api/badge endpoint).
 *
 * NOTE: GitHub serves README images through its camo proxy (referer stripped +
 * cached), so per-repo attribution from badge *renders* is impossible — code
 * search is the reliable adoption measure. Run periodically to track the campaign.
 *
 *   npx tsx scripts/badge-adoption.ts
 *
 * Auth: `gh auth token` (falls back to GITHUB_TOKEN).
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LEDGER = join(process.cwd(), "scripts", "notify-ledger.json");

const TOKEN = (() => {
  try {
    return execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    console.error("Need a GitHub token: run `gh auth login` or set GITHUB_TOKEN.");
    process.exit(1);
  }
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gh<T = unknown>(path: string): Promise<{ status: number; data: T }> {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": "takoapi-badge-adoption",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function ledgerFunnel() {
  console.log("── outreach funnel (from ledger) ──");
  if (!existsSync(LEDGER)) {
    console.log("no ledger yet — run `notify-listed-repos.ts --send` first.\n");
    return;
  }
  const led = JSON.parse(readFileSync(LEDGER, "utf8")) as {
    repos: Record<string, { slug: string; status: string; prUrl?: string; date: string }>;
  };
  const entries = Object.entries(led.repos);
  const opened = entries.filter(([, e]) => e.status === "pr-opened" && e.prUrl);
  console.log(`ledger entries: ${entries.length} | PRs opened: ${opened.length}`);

  let merged = 0,
    open = 0,
    closed = 0;
  for (const [repo, e] of opened) {
    const m = e.prUrl!.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!m) continue;
    const pr = await gh(`/repos/${m[1]}/${m[2]}/pulls/${m[3]}`);
    if (pr.status === 200) {
      const state = pr.data.merged_at ? "merged" : pr.data.state;
      if (state === "merged") merged++;
      else if (state === "open") open++;
      else closed++;
      console.log(`  ${repo.padEnd(40)} ${state}`);
    }
    await sleep(300);
  }
  console.log(`\n  merged: ${merged} | still open: ${open} | closed w/o merge: ${closed}`);
}

async function footprint() {
  console.log("\n── footprint (GitHub code search) ──");
  const queries = ['"takoapi.com/agents"', '"takoapi.com/api/badge"'];
  const repos = new Set<string>();
  for (const q of queries) {
    const res = await gh(`/search/code?q=${encodeURIComponent(q)}&per_page=100`);
    if (res.status !== 200) {
      console.log(`  ${q} → HTTP ${res.status} ${res.data?.message || ""}`);
      await sleep(6000);
      continue;
    }
    console.log(`  ${q}: ${res.data.total_count} code hits`);
    for (const it of res.data.items || []) repos.add(it.repository.full_name);
    await sleep(6000); // code search is limited to ~10 req/min
  }
  console.log(`\n  distinct repos linking back: ${repos.size}`);
  for (const r of [...repos].sort()) console.log(`    ${r}`);
}

(async () => {
  await ledgerFunnel();
  await footprint();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
