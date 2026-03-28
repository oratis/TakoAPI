// Parse the awesome-openclaw-skills README.md into JSON seed data
import * as fs from "fs";
import * as path from "path";

interface SkillEntry {
  name: string;
  slug: string;
  description: string;
  clawHubUrl: string;
  author: string;
  category: string;
}

interface CategoryEntry {
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

function parseReadme(content: string): {
  skills: SkillEntry[];
  categories: CategoryEntry[];
} {
  const skills: SkillEntry[] = [];
  const categoryMap = new Map<string, number>();
  let currentCategory = "";

  const lines = content.split("\n");

  for (const line of lines) {
    // Detect category headers: <summary><h3 ...>Category Name</h3></summary>
    const categoryMatch = line.match(
      /<summary><h3[^>]*>([^<]+)<\/h3><\/summary>/
    );
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      if (!categoryMap.has(currentCategory)) {
        categoryMap.set(currentCategory, 0);
      }
      continue;
    }

    // Detect skill entries: - [name](url) - Description
    const skillMatch = line.match(
      /^- \[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*-\s*(.+)$/
    );
    if (skillMatch && currentCategory) {
      const [, name, url, description] = skillMatch;
      // Extract author from URL: https://clawskills.sh/skills/author-skillname
      const authorMatch = url.match(/\/skills\/([^-]+)-/);
      const author = authorMatch ? authorMatch[1] : "";

      skills.push({
        name: name.trim(),
        slug: slugify(name.trim()),
        description: description.trim(),
        clawHubUrl: url,
        author,
        category: currentCategory,
      });

      categoryMap.set(
        currentCategory,
        (categoryMap.get(currentCategory) || 0) + 1
      );
    }
  }

  const categories: CategoryEntry[] = Array.from(categoryMap.entries()).map(
    ([name, count]) => ({
      name,
      slug: slugify(name),
      skillCount: count,
    })
  );

  return { skills, categories };
}

const readmePath =
  process.argv[2] || "/tmp/awesome-openclaw-skills-readme.md";
const content = fs.readFileSync(readmePath, "utf-8");
const { skills, categories } = parseReadme(content);

const outputDir = path.join(__dirname, "..", "prisma");
fs.writeFileSync(
  path.join(outputDir, "seed-data.json"),
  JSON.stringify({ categories, skills }, null, 2)
);

console.log(`Parsed ${categories.length} categories and ${skills.length} skills`);
categories.forEach((c) => console.log(`  ${c.name}: ${c.skillCount} skills`));
