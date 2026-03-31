import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const dataPath = path.join(__dirname, "seed-data.json");
  if (!fs.existsSync(dataPath)) {
    console.error("Run `npx tsx scripts/scrape-clawskills.ts` first to generate seed data");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  // Upsert categories
  const categoryIdMap = new Map<string, string>();
  for (const cat of data.categories) {
    const catSlug = cat.slug || slugify(cat.name);
    const created = await prisma.category.upsert({
      where: { slug: catSlug },
      update: { skillCount: cat.skillCount, name: cat.name },
      create: {
        name: cat.name,
        slug: catSlug,
        skillCount: cat.skillCount,
      },
    });
    categoryIdMap.set(cat.name, created.id);
  }
  console.log(`Upserted ${data.categories.length} categories`);

  // Upsert skills in batches
  let count = 0;
  let skipped = 0;
  for (const skill of data.skills) {
    const categoryId = categoryIdMap.get(skill.category);
    if (!categoryId) {
      skipped++;
      continue;
    }

    // Use the clawskills slug as our slug
    let slug = skill.slug || slugify(skill.name);

    // Construct clawHub URL from author and skill name
    const clawHubUrl = skill.clawHubUrl || skill.clawSkillsUrl || null;

    await prisma.skill.upsert({
      where: { slug },
      update: {
        description: skill.description,
        brief: skill.description, // Use description as brief initially
        clawHubUrl,
        clawSkillsUrl: skill.clawSkillsUrl || null,
        author: skill.author,
        downloads: skill.downloads || 0,
        stars: skill.stars || 0,
      },
      create: {
        name: skill.name,
        slug,
        brief: skill.description,
        description: skill.description,
        clawHubUrl,
        clawSkillsUrl: skill.clawSkillsUrl || null,
        githubUrl: null,
        installCmd: `clawhub install ${skill.name || slug}`,
        author: skill.author,
        categoryId,
        downloads: skill.downloads || 0,
        stars: skill.stars || 0,
      },
    });
    count++;
    if (count % 200 === 0) console.log(`  Seeded ${count} skills...`);
  }
  console.log(`Seeded ${count} skills total (skipped ${skipped})`);

  // Recount categories
  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    const count = await prisma.skill.count({ where: { categoryId: cat.id } });
    await prisma.category.update({
      where: { id: cat.id },
      data: { skillCount: count },
    });
  }
  console.log("Recounted category skill counts");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
