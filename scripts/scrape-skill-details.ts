import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CONCURRENCY = 2; // parallel browser pages (reduced to avoid DB connection limit)
const prisma = new PrismaClient();

interface SkillDetail {
  whatItDoes: string | null;
  whenToUseIt: string[] | null;
  exampleWorkflow: string | null;
  requirements: string[] | null;
  githubUrl: string | null;
  installCmd: string | null;
  version: string | null;
}

async function scrapeSkillPage(page: puppeteer.Page, slug: string): Promise<SkillDetail | null> {
  try {
    await page.goto(`https://clawskills.sh/skills/${slug}`, {
      waitUntil: "networkidle0",
      timeout: 20000,
    });

    const detail = await page.evaluate(() => {
      const text = document.body.innerText;

      // Extract "What This Skill Does" section
      let whatItDoes: string | null = null;
      const whatIdx = text.indexOf("What This Skill Does");
      if (whatIdx !== -1) {
        const afterWhat = text.substring(whatIdx + "What This Skill Does".length).trim();
        const nextSection = afterWhat.search(/\n(Example Workflow|Similar Skills|View original|WHEN TO USE IT)/);
        const whenIdx = afterWhat.indexOf("WHEN TO USE IT");

        if (whenIdx !== -1) {
          whatItDoes = afterWhat.substring(0, whenIdx).trim();
        } else if (nextSection !== -1) {
          whatItDoes = afterWhat.substring(0, nextSection).trim();
        } else {
          whatItDoes = afterWhat.substring(0, 500).trim();
        }
      }

      // Extract "WHEN TO USE IT" items
      let whenToUseIt: string[] | null = null;
      const whenIdx2 = text.indexOf("WHEN TO USE IT");
      if (whenIdx2 !== -1) {
        const afterWhen = text.substring(whenIdx2 + "WHEN TO USE IT".length).trim();
        const endWhen = afterWhen.indexOf("View original");
        const rawWhen = endWhen !== -1 ? afterWhen.substring(0, endWhen) : afterWhen.substring(0, 500);
        whenToUseIt = rawWhen
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 5 && !l.startsWith("View"));
      }

      // Extract "Example Workflow" section
      let exampleWorkflow: string | null = null;
      const exIdx = text.indexOf("Example Workflow");
      if (exIdx !== -1) {
        const afterEx = text.substring(exIdx + "Example Workflow".length).trim();
        const endEx = afterEx.search(/\n(Requirements|Similar Skills)/);
        exampleWorkflow = endEx !== -1
          ? afterEx.substring(0, endEx).trim()
          : afterEx.substring(0, 1000).trim();
        // Remove the "Here's how..." intro if present
        exampleWorkflow = exampleWorkflow
          .replace("Here's how your AI assistant might use this skill in practice.", "")
          .trim();
      }

      // Extract "Requirements" section
      let requirements: string[] | null = null;
      const reqIdx = text.indexOf("Requirements\n");
      if (reqIdx !== -1) {
        const afterReq = text.substring(reqIdx + "Requirements".length).trim();
        const endReq = afterReq.indexOf("Similar Skills");
        const rawReq = endReq !== -1 ? afterReq.substring(0, endReq) : afterReq.substring(0, 500);
        requirements = rawReq
          .split("\n")
          .map((l: string) => l.trim())
          .filter(
            (l: string) =>
              l.length > 5 &&
              !l.startsWith("Accounts") &&
              !l.startsWith("Similar") &&
              !l.startsWith("VIEW")
          );
      }

      // Extract GitHub URL
      let githubUrl: string | null = null;
      const ghLink = Array.from(document.querySelectorAll("a")).find(
        (a) => a.href && a.href.includes("github.com/openclaw/skills")
      );
      if (ghLink) githubUrl = ghLink.href;

      // Extract install command
      let installCmd: string | null = null;
      const installMatch = text.match(/clawhub install ([^\n]+)/);
      if (installMatch) installCmd = `clawhub install ${installMatch[1].trim()}`;

      // Extract version
      let version: string | null = null;
      const versionMatch = text.match(/v(\d+\.\d+\.\d+)/);
      if (versionMatch) version = versionMatch[0];

      return { whatItDoes, whenToUseIt, exampleWorkflow, requirements, githubUrl, installCmd, version };
    });

    return detail;
  } catch {
    return null;
  }
}

async function processSkillBatch(
  browser: puppeteer.Browser,
  skills: { id: string; slug: string; clawSkillsUrl: string | null }[],
  batchNum: number
) {
  const page = await browser.newPage();
  let processed = 0;

  for (const skill of skills) {
    if (!skill.clawSkillsUrl) continue;

    // Extract the clawskills slug from URL
    const clawSlug = skill.clawSkillsUrl.split("/skills/")[1];
    if (!clawSlug) continue;

    const detail = await scrapeSkillPage(page, clawSlug);
    if (!detail) continue;

    // Build the description from whatItDoes + whenToUseIt
    const descParts: string[] = [];
    if (detail.whatItDoes) descParts.push(detail.whatItDoes);
    if (detail.whenToUseIt && detail.whenToUseIt.length > 0) {
      descParts.push("\n\nWhen to use it:\n" + detail.whenToUseIt.map((s) => `- ${s}`).join("\n"));
    }

    // Build the readme from full detail
    const readmeParts: string[] = [];
    if (detail.whatItDoes) {
      readmeParts.push("## What This Skill Does\n\n" + detail.whatItDoes);
    }
    if (detail.whenToUseIt && detail.whenToUseIt.length > 0) {
      readmeParts.push(
        "## When to Use It\n\n" + detail.whenToUseIt.map((s) => `- ${s}`).join("\n")
      );
    }
    if (detail.exampleWorkflow) {
      readmeParts.push("## Example Workflow\n\n" + detail.exampleWorkflow);
    }
    if (detail.requirements && detail.requirements.length > 0) {
      readmeParts.push(
        "## Requirements\n\n" + detail.requirements.map((s) => `- ${s}`).join("\n")
      );
    }

    const updateData: Record<string, unknown> = {};
    if (descParts.length > 0) updateData.description = descParts.join("");
    if (readmeParts.length > 0) updateData.readme = readmeParts.join("\n\n");
    if (detail.githubUrl) updateData.githubUrl = detail.githubUrl;
    if (detail.installCmd) updateData.installCmd = detail.installCmd;

    if (Object.keys(updateData).length > 0) {
      await prisma.skill.update({
        where: { id: skill.id },
        data: updateData,
      });
    }

    processed++;
    if (processed % 50 === 0) {
      console.log(`  Worker ${batchNum}: ${processed}/${skills.length} done`);
    }
  }

  await page.close();
  console.log(`  Worker ${batchNum}: finished ${processed}/${skills.length}`);
  return processed;
}

async function main() {
  console.log("Fetching skills with clawSkillsUrl...");
  const skills = await prisma.skill.findMany({
    where: {
      clawSkillsUrl: { not: null },
      readme: null, // Only fetch skills we haven't scraped yet
    },
    select: { id: true, slug: true, clawSkillsUrl: true },
    orderBy: { downloads: "desc" },
  });

  console.log(`Found ${skills.length} skills to scrape`);
  if (skills.length === 0) {
    console.log("Nothing to do");
    return;
  }

  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // Split skills into batches for parallel processing
  const batchSize = Math.ceil(skills.length / CONCURRENCY);
  const batches = [];
  for (let i = 0; i < skills.length; i += batchSize) {
    batches.push(skills.slice(i, i + batchSize));
  }

  console.log(`Processing ${skills.length} skills with ${batches.length} workers...`);
  const promises = batches.map((batch, i) => processSkillBatch(browser, batch, i + 1));
  const results = await Promise.all(promises);
  const total = results.reduce((a, b) => a + b, 0);

  await browser.close();
  console.log(`\nDone! Updated ${total} skills with detail data`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
