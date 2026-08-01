/**
 * Daily Sync Script for TakoAPI
 * 1. Incremental update from ClawSkills.sh (new skills + updated downloads/stars)
 * 2. Deduplicate skills (keep highest downloads per skill name)
 * 3. Recount category skill counts
 *
 * Run: DATABASE_URL=... npx tsx scripts/daily-sync.ts
 */

import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
async function syncFromClawSkills() {
  console.log("\n=== Step 1: Syncing from ClawSkills.sh ===");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto("https://clawskills.sh/", {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.waitForSelector('a[href*="/skills/"]', { timeout: 30000 });

  // Get all category buttons
  const catNames: string[] = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons
      .filter((b) => {
        const text = b.textContent?.trim() || "";
        return (
          /^[A-Z].*\d+$/.test(text) && text.length < 60 && !text.includes("5147")
        );
      })
      .map((b) => {
        const text = b.textContent?.trim() || "";
        const match = text.match(/^(.+?)(\d+)$/);
        return match ? match[1].trim() : text;
      });
  });

  // Get existing slugs from DB
  const existingSlugs = new Set(
    (await prisma.skill.findMany({ select: { slug: true } })).map((s) => s.slug)
  );

  // Get existing category map
  const categoryMap = new Map<string, string>();
  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    categoryMap.set(cat.name, cat.id);
  }

  let newCount = 0;
  let updatedCount = 0;

  // Process each category
  for (const catName of catNames) {
    let categoryId = categoryMap.get(catName);
    if (!categoryId) {
      // Create new category
      const cat = await prisma.category.create({
        data: { name: catName, slug: slugify(catName), skillCount: 0 },
      });
      categoryId = cat.id;
      categoryMap.set(catName, categoryId);
      console.log(`  New category: ${catName}`);
    }

    // Click category button
    const clicked = await page.evaluate((name: string) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) =>
        (b.textContent?.trim() || "").startsWith(name)
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, catName);

    if (!clicked) continue;
    await new Promise((r) => setTimeout(r, 500));

    // Extract skills
    const skills = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a")).filter(
        (a) =>
          a.href &&
          a.href.includes("/skills/") &&
          !a.href.endsWith("/skills/")
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
    });

    for (const sk of skills) {
      if (!sk.slug || !sk.name) continue;

      const downloads = parseDownloads(sk.downloads);
      const stars = parseInt(sk.stars) || 0;

      if (existingSlugs.has(sk.slug)) {
        // Update existing: downloads + stars only
        await prisma.skill.update({
          where: { slug: sk.slug },
          data: { downloads, stars },
        });
        updatedCount++;
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
              installCmd: `clawhub install ${sk.name}`,
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
          existingSlugs.add(sk.slug);
          newCount++;
        } catch {
          // Slug collision - skip
        }
      }
    }
  }

  await browser.close();
  console.log(`  New skills: ${newCount}`);
  console.log(`  Updated skills: ${updatedCount}`);
  return { newCount, updatedCount };
}

// ============================================
// STEP 2: Deduplicate skills
// ============================================
async function deduplicateSkills() {
  console.log("\n=== Step 2: Deduplicating skills ===");

  // Find duplicate names (case-insensitive)
  const allSkills = await prisma.skill.findMany({
    select: { id: true, name: true, slug: true, downloads: true, likesCount: true, viewsCount: true },
    orderBy: { downloads: "desc" },
  });

  // Group by lowercase name
  const groups = new Map<string, typeof allSkills>();
  for (const skill of allSkills) {
    const key = skill.name.toLowerCase().trim();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(skill);
  }

  let removedCount = 0;
  const toDelete: string[] = [];

  for (const [name, skills] of groups) {
    if (skills.length <= 1) continue;

    // Sort by downloads desc, then likesCount, then viewsCount
    skills.sort((a, b) => {
      if (b.downloads !== a.downloads) return b.downloads - a.downloads;
      if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
      return b.viewsCount - a.viewsCount;
    });

    // Keep the first (highest downloads), delete the rest
    const keep = skills[0];
    const dupes = skills.slice(1);

    if (dupes.length > 0) {
      console.log(
        `  "${name}": keeping ${keep.slug} (${keep.downloads} dl), removing ${dupes.length} dupes`
      );
    }

    for (const dupe of dupes) {
      toDelete.push(dupe.id);
    }
    removedCount += dupes.length;
  }

  // Delete duplicates (and their likes)
  if (toDelete.length > 0) {
    await prisma.like.deleteMany({
      where: { skillId: { in: toDelete } },
    });
    await prisma.skill.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  console.log(`  Removed ${removedCount} duplicate skills`);
  return removedCount;
}

// ============================================
// STEP 3: Recount categories
// ============================================
async function recountCategories() {
  console.log("\n=== Step 3: Recounting categories ===");

  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    const count = await prisma.skill.count({
      where: { categoryId: cat.id },
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
async function main() {
  const start = Date.now();
  console.log(`TakoAPI Daily Sync - ${new Date().toISOString()}`);

  try {
    const syncResult = await syncFromClawSkills();
    const removedCount = await deduplicateSkills();
    await recountCategories();

    const totalSkills = await prisma.skill.count();
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n=== Summary ===`);
    console.log(`  New skills: ${syncResult.newCount}`);
    console.log(`  Updated: ${syncResult.updatedCount}`);
    console.log(`  Deduped: ${removedCount}`);
    console.log(`  Total skills: ${totalSkills}`);
    console.log(`  Duration: ${duration}s`);
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
