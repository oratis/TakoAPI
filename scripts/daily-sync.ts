/**
 * Daily Sync Script for TakoAPI
 * 1. Incremental update from ClawSkills.sh (new skills + updated downloads/stars)
 * 2. Recount category skill counts
 *
 * Run:     DATABASE_URL=... npx tsx scripts/daily-sync.ts
 * Dry run: DATABASE_URL=... npx tsx scripts/daily-sync.ts --dry
 *
 * WHY THIS SCRIPT SHOUTS
 * ----------------------
 * This job ran green every night from 2026-07-04 to 2026-09-05 and imported
 * nothing. It drives clawskills.sh with Puppeteer and finds the category chips by
 * matching a regex against button text; the site changed its markup, the filter
 * matched zero buttons, the import loop never ran, and the process still exited 0.
 * A pipeline that reports success while importing nothing is worse than one that
 * crashes, so every "the selector matched nothing" path below is now a hard
 * failure that names the selector that came up empty, and the run summary goes out
 * as a structured line (src/lib/ingestion-log.ts) that Cloud Logging can alert on.
 *
 * `--dry` scrapes and reports without writing, so a selector change can be
 * confirmed against production data before anything touches the database.
 */

import puppeteer from "puppeteer-core";
import { Prisma, PrismaClient } from "@prisma/client";
import { logIngestionRun } from "../src/lib/ingestion-log";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const JOB = "daily-sync";
const SOURCE_URL = "https://clawskills.sh/";

/**
 * The selectors this scrape depends on, in one place, because every failure
 * message has to name the one that came up empty — "found 0 skills" sent nobody
 * to the right line of code for two months.
 *
 * `categoryLabelPattern` is passed into the page as a string and rebuilt with
 * `new RegExp` there: a RegExp cannot cross the page.evaluate boundary, and
 * keeping a second copy inline is how these two drift apart.
 */
const SELECTORS = {
  /** Skill detail links; also the readiness probe for the initial page load. */
  skillLink: 'a[href*="/skills/"]',
  /** Category chips are <button>s labelled "<Name><count>", e.g. "Productivity42". */
  categoryChip: "button",
  categoryLabelPattern: "^[A-Z].*\\d+$",
} as const;

/**
 * Chip labels that are not categories. The "All" chip carries the site-wide total,
 * and the previous filter excluded it by hard-coding that total ("5147") — so the
 * moment ClawSkills added one skill, "All" started being imported as a category.
 * Matching the name instead of the count does not rot.
 */
const NON_CATEGORY_LABELS = new Set(["all", "all skills"]);

const DRY = process.argv.includes("--dry");

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseDownloads(dl: string): number {
  if (!dl || dl === "0") return 0;
  dl = dl.replace(/,/g, "");
  if (dl.endsWith("k")) return Math.round(parseFloat(dl) * 1000);
  if (dl.endsWith("M")) return Math.round(parseFloat(dl) * 1000000);
  return parseInt(dl) || 0;
}

// ============================================
// STEP 1: Incremental sync from ClawSkills.sh
// ============================================
type SyncResult = {
  categories: number;
  /** Scraped rows across all categories, before validation or dedupe. */
  found: number;
  newCount: number;
  updatedCount: number;
  /** Categories whose chip could not be clicked on the second pass. */
  unclickable: string[];
  /** Categories that clicked but yielded no skill links. */
  empty: string[];
  /** Rows dropped for a missing slug/name, or lost to a slug collision. */
  malformed: number;
};

async function syncFromClawSkills(): Promise<SyncResult> {
  console.log("\n=== Step 1: Syncing from ClawSkills.sh ===");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(SOURCE_URL, { waitUntil: "networkidle0", timeout: 60000 });
    // If this throws, the page shape changed before we even got to the chips —
    // the error names the selector, which is the whole point.
    await page.waitForSelector(SELECTORS.skillLink, { timeout: 30000 }).catch(() => {
      throw new Error(
        `${SOURCE_URL} rendered no '${SELECTORS.skillLink}' within 30s — the skill link selector no longer matches`
      );
    });

    // Get all category chips
    const catNames: string[] = await page.evaluate(
      (chipSelector: string, labelPattern: string, nonCategories: string[]) => {
        const isCategory = new RegExp(labelPattern);
        const excluded = new Set(nonCategories);
        const names = Array.from(document.querySelectorAll(chipSelector))
          .map((b) => (b.textContent?.trim() || ""))
          .filter((text) => isCategory.test(text) && text.length < 60)
          .map((text) => {
            const match = text.match(/^(.+?)(\d+)$/);
            return match ? match[1].trim() : text;
          })
          .filter((name) => name.length > 0 && !excluded.has(name.toLowerCase()));
        // A chip repeated in the markup (mobile + desktop nav) would otherwise be
        // scraped twice and collide on Category.slug the first time it is created.
        return Array.from(new Set(names));
      },
      SELECTORS.categoryChip,
      SELECTORS.categoryLabelPattern,
      [...NON_CATEGORY_LABELS]
    );

    // Hard stop: no categories means the chip selector is dead. Continuing from
    // here is what produced two months of successful, empty runs.
    if (catNames.length === 0) {
      throw new Error(
        `no category chips matched on ${SOURCE_URL} — selector '${SELECTORS.categoryChip}' with label pattern /${SELECTORS.categoryLabelPattern}/ returned 0 categories`
      );
    }
    console.log(`  Categories found: ${catNames.length}`);

    // Get existing slugs from DB
    const stored = await prisma.skill.findMany({
      select: { slug: true, clawSkillsUrl: true, submitterId: true, downloads: true, stars: true },
    });
    const existing = new Map(stored.map((row) => [row.slug, row]));
    const seen = new Set<string>();

    // Get existing category map
    const categoryMap = new Map<string, string>();
    const categories = await prisma.category.findMany();
    for (const cat of categories) {
      categoryMap.set(cat.name, cat.id);
    }

    let found = 0;
    let newCount = 0;
    let updatedCount = 0;
    let malformed = 0;
    const unclickable: string[] = [];
    const empty: string[] = [];

    // Process each category
    for (const catName of catNames) {
      let categoryId = categoryMap.get(catName);
      if (!categoryId) {
        if (DRY) {
          console.log(`  [dry] Would create category: ${catName}`);
        } else {
          // Create new category
          const cat = await prisma.category.create({
            data: { name: catName, slug: slugify(catName), skillCount: 0 },
          });
          categoryId = cat.id;
          categoryMap.set(catName, categoryId);
          console.log(`  New category: ${catName}`);
        }
      }

      // Click category chip
      const clicked = await page.evaluate(
        (chipSelector: string, name: string) => {
          const btn = Array.from(document.querySelectorAll(chipSelector)).find((b) =>
            (b.textContent?.trim() || "").startsWith(name)
          );
          if (btn instanceof HTMLElement) {
            btn.click();
            return true;
          }
          return false;
        },
        SELECTORS.categoryChip,
        catName
      );

      // Was silently `continue` — a chip we just listed and cannot click back is a
      // markup change, not a normal skip.
      if (!clicked) {
        unclickable.push(catName);
        continue;
      }
      await new Promise((r) => setTimeout(r, 500));

      // Extract skills
      const skills = await page.evaluate((linkSelector: string) => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(linkSelector)).filter(
          (a) => a.href && !a.href.endsWith("/skills/")
        );
        return links.map((a) => {
          const slug = a.href.split("/skills/")[1];
          const children = Array.from(a.querySelectorAll("*")).filter(
            (c) => c.children.length === 0
          );
          const texts = children
            .map((c) => c.textContent?.trim() || "")
            .filter((t) => t.length > 0);
          return {
            slug,
            name: texts[1] || "",
            author: (texts[2] || "").replace("/skills", ""),
            description: texts[3] || "",
            downloads: texts[4] || "0",
            stars: texts[5] || "0",
          };
        });
      }, SELECTORS.skillLink);

      // Every category on this source has entries; zero means the link selector
      // stopped matching, not that the category emptied out.
      if (skills.length === 0) {
        empty.push(catName);
        continue;
      }
      found += skills.length;

      for (const sk of skills) {
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(sk.slug) || !sk.name) {
          malformed++;
          continue;
        }

        const downloads = parseDownloads(sk.downloads);
        const stars = parseInt(sk.stars) || 0;

        if (seen.has(sk.slug)) continue;
        seen.add(sk.slug);
        const previous = existing.get(sk.slug);
        if (previous) {
          if (previous.submitterId || previous.clawSkillsUrl !== `https://clawskills.sh/skills/${sk.slug}`) continue;
          if (previous.downloads === downloads && previous.stars === stars) continue;
          // Update existing: downloads + stars only
          if (!DRY) {
            await prisma.skill.update({
              where: { slug: sk.slug },
              data: { downloads, stars },
            });
          }
          updatedCount++;
        } else if (DRY || !categoryId) {
          // Count it as new without writing, and remember it so a slug repeated
          // across categories is not counted twice. `!categoryId` only happens
          // under --dry, where the category row was reported rather than created.
          newCount++;
        } else {
          // Insert new skill
          try {
            await prisma.skill.create({
              data: {
                name: sk.name,
                slug: sk.slug,
                brief: sk.description,
                description: sk.description,
                clawSkillsUrl: `https://clawskills.sh/skills/${sk.slug}`,
                clawHubUrl: `https://clawskills.sh/skills/${sk.slug}`,
                installCmd: /^[a-z0-9][a-z0-9._-]*$/i.test(sk.name) ? `clawhub install ${sk.name}` : null,
                author: sk.author,
                categoryId,
                downloads,
                stars,
                // Enum schema (main): new skills default to PENDING (hidden).
                // ClawSkills is a curated bulk import → publish + tag source.
                status: "APPROVED",
                source: "CURATED",
              },
            });
            newCount++;
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
            malformed++;
          }
        }
      }
    }

    console.log(`  Scraped rows: ${found}`);
    console.log(`  ${DRY ? "Would add" : "New"} skills: ${newCount}`);
    console.log(`  ${DRY ? "Would update" : "Updated"} skills: ${updatedCount}`);
    return {
      categories: catNames.length,
      found,
      newCount,
      updatedCount,
      unclickable,
      empty,
      malformed,
    };
  } finally {
    // Closed in `finally` so a mid-loop throw does not leave headless Chrome
    // holding the Cloud Run Job's memory until the task timeout.
    await browser.close();
  }
}

// ============================================
// STEP 2: Recount categories
// ============================================
async function recountCategories() {
  console.log("\n=== Step 3: Recounting categories ===");

  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    const count = await prisma.skill.count({
      where: { categoryId: cat.id, status: "APPROVED" },
    });
    if (count !== cat.skillCount) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { skillCount: count },
      });
    }
  }
  console.log(`  Recounted ${categories.length} categories`);
}

// ============================================
// Main
// ============================================
async function main(): Promise<number> {
  const start = Date.now();
  console.log(
    `TakoAPI Daily Sync - ${new Date().toISOString()}${DRY ? " (--dry: scrape only, no writes)" : ""}`
  );

  let sync: SyncResult;
  try {
    sync = await syncFromClawSkills();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Sync failed: ${message}`);
    logIngestionRun({
      job: JOB,
      found: 0,
      imported: 0,
      skipped: 0,
      durationMs: Date.now() - start,
      errors: [message],
    });
    return 1;
  }

  if (DRY) {
    console.log("\n=== Category recount skipped (--dry) ===");
  } else {
    await recountCategories();
  }

  // Every condition below means "the scrape ran and came back with nothing".
  // Each one names the selector to look at, because the previous version of this
  // script reported all three of them as a successful run.
  const errors: string[] = [];
  if (sync.unclickable.length > 0) {
    errors.push(
      `${sync.unclickable.length} category chip(s) could not be re-located by '${SELECTORS.categoryChip}' matching the chip label: ${sync.unclickable.join(", ")}`
    );
  }
  if (sync.empty.length > 0) {
    errors.push(
      `${sync.empty.length} categor${sync.empty.length === 1 ? "y" : "ies"} yielded no rows for selector '${SELECTORS.skillLink}': ${sync.empty.join(", ")}`
    );
  }
  if (sync.found === 0 || sync.malformed === sync.found) {
    errors.push(
      `no usable source rows across ${sync.categories} categor${sync.categories === 1 ? "y" : "ies"} and ${sync.found} scraped row(s) — check selectors '${SELECTORS.categoryChip}' and '${SELECTORS.skillLink}' against ${SOURCE_URL}`
    );
  }

  const totalSkills = await prisma.skill.count();
  const durationMs = Date.now() - start;

  console.log(`\n=== Summary ===`);
  console.log(`  Categories: ${sync.categories}`);
  console.log(`  Scraped rows: ${sync.found}`);
  console.log(`  ${DRY ? "Would add" : "New"} skills: ${sync.newCount}`);
  console.log(`  ${DRY ? "Would update" : "Updated"}: ${sync.updatedCount}`);
  console.log(`  Malformed/collided rows: ${sync.malformed}`);
  console.log(`  Total skills: ${totalSkills}`);
  console.log(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
  for (const e of errors) console.error(`  ERROR: ${e}`);

  // NOTE: no cache revalidation here. This runs as a Cloud Run *Job*, a separate
  // process from the Next server, so `revalidateTag` is not reachable — the
  // catalogue caches in src/lib/catalog.ts fall back to their time bound (5-10 min).
  const severity = logIngestionRun({
    job: JOB,
    found: sync.found,
    imported: sync.newCount + sync.updatedCount,
    // Scraped rows we did not write: malformed, collided, or already seen in an
    // earlier category (the same skill is listed under several).
    skipped: Math.max(0, sync.found - sync.newCount - sync.updatedCount),
    durationMs,
    errors,
  });

  return severity === "ERROR" ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    return 1;
  })
  .then(async (code) => {
    await prisma.$disconnect();
    // Exit explicitly: a non-zero code is the only thing Cloud Run Jobs surfaces as
    // a failed execution, and it is what the "ingestion job failed" alert watches.
    process.exit(code);
  });
