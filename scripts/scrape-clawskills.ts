import puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

interface SkillData {
  slug: string;
  name: string;
  author: string;
  description: string;
  category: string;
  downloads: string;
  stars: string;
  clawSkillsUrl: string;
}

interface CategoryData {
  name: string;
  slug: string;
  skillCount: number;
}

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

async function main() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  console.log("Navigating to clawskills.sh...");
  await page.goto("https://clawskills.sh/", { waitUntil: "networkidle0", timeout: 60000 });

  // Wait for skills to load
  await page.waitForSelector('a[href*="/skills/"]', { timeout: 30000 });
  console.log("Page loaded. Extracting categories...");

  // Get category buttons
  const catNames: string[] = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons
      .filter((b) => {
        const text = b.textContent?.trim() || "";
        return text.match(/^[A-Z].*\d+$/) && text.length < 60 && !text.includes("5147");
      })
      .map((b) => {
        const text = b.textContent?.trim() || "";
        const match = text.match(/^(.+?)(\d+)$/);
        return match ? match[1].trim() : text;
      });
  });

  console.log(`Found ${catNames.length} categories: ${catNames.join(", ")}`);

  // Also add iOS & macOS Development if not in list
  const allCatNames = [...catNames];
  if (!allCatNames.includes("iOS & macOS Development")) {
    allCatNames.push("iOS & macOS Development");
  }

  const allSkills: SkillData[] = [];
  const categoryData: CategoryData[] = [];

  // Extract skills for each category
  for (const catName of allCatNames) {
    console.log(`  Extracting: ${catName}...`);

    // Click category button
    const clicked = await page.evaluate((name: string) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => (b.textContent?.trim() || "").startsWith(name));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, catName);

    if (!clicked) {
      console.log(`    WARNING: Could not find button for "${catName}"`);
      continue;
    }

    // Wait for DOM update
    await new Promise((r) => setTimeout(r, 600));

    // Extract skills
    const skills: SkillData[] = await page.evaluate((cat: string) => {
      const links = Array.from(document.querySelectorAll("a")).filter(
        (a) => a.href && a.href.includes("/skills/") && !a.href.endsWith("/skills/")
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
          description: (texts[3] || "").replace(/\t/g, " ").replace(/\n/g, " "),
          category: cat,
          downloads: texts[4] || "0",
          stars: texts[5] || "0",
          clawSkillsUrl: "https://clawskills.sh/skills/" + slug,
        };
      });
    }, catName);

    console.log(`    Found ${skills.length} skills`);
    categoryData.push({
      name: catName,
      slug: slugify(catName),
      skillCount: skills.length,
    });
    allSkills.push(...skills);
  }

  // Click "All" to reset
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const allBtn = buttons.find((b) => (b.textContent?.trim() || "").startsWith("All"));
    if (allBtn) allBtn.click();
  });

  await browser.close();

  // Build seed data
  const seedData = {
    categories: categoryData,
    skills: allSkills.map((sk) => ({
      name: sk.name,
      slug: sk.slug,
      description: sk.description,
      clawHubUrl: sk.clawSkillsUrl,
      clawSkillsUrl: sk.clawSkillsUrl,
      author: sk.author,
      category: sk.category,
      downloads: parseDownloads(sk.downloads),
      stars: parseInt(sk.stars) || 0,
    })),
  };

  const outPath = path.join(__dirname, "..", "prisma", "seed-data.json");
  fs.writeFileSync(outPath, JSON.stringify(seedData, null, 2));
  console.log(`\nDone! Wrote ${seedData.categories.length} categories, ${seedData.skills.length} skills to ${outPath}`);
}

main().catch(console.error);
