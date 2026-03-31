import { NextRequest, NextResponse } from "next/server";

function parseReadmeSections(readme: string) {
  const sections: Record<string, string> = {};

  // Try ## headers first
  const parts = readme.split(/^##\s+/m);
  if (parts.length > 1) {
    // First part before any ## is the intro
    const intro = parts[0].trim();
    if (intro) {
      // Extract title from # header
      const titleMatch = intro.match(/^#\s+(.+)/m);
      if (titleMatch) sections._title = titleMatch[1].trim();
      // Everything after # title is the brief
      const afterTitle = intro.replace(/^#\s+.+/m, "").trim();
      if (afterTitle) sections._brief = afterTitle.split("\n")[0].trim();
    }

    for (let i = 1; i < parts.length; i++) {
      const newlineIdx = parts[i].indexOf("\n");
      if (newlineIdx === -1) continue;
      const heading = parts[i].substring(0, newlineIdx).trim();
      const content = parts[i].substring(newlineIdx + 1).trim();
      sections[heading.toLowerCase()] = content;
    }
  }

  return sections;
}

function extractGithubInfo(url: string) {
  // Parse: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const githubInfo = extractGithubInfo(url);
    if (!githubInfo) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    const { owner, repo } = githubInfo;

    // Fetch repo info from GitHub API
    const [repoRes, readmeRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      }),
      fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`).then(
        (r) =>
          r.ok
            ? r
            : fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`)
      ),
    ]);

    const result: Record<string, string | null> = {
      name: null,
      brief: null,
      description: null,
      whatItDoes: null,
      exampleWorkflow: null,
      requirements: null,
      readme: null,
    };

    // Parse repo info
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      result.name = repoData.name || null;
      result.brief = repoData.description || null;
    }

    // Parse README
    if (readmeRes.ok) {
      const readmeText = await readmeRes.text();
      result.readme = readmeText;

      const sections = parseReadmeSections(readmeText);

      // Extract name from title if not from repo
      if (!result.name && sections._title) {
        result.name = sections._title;
      }

      // Extract brief from first paragraph if not from repo description
      if (!result.brief && sections._brief) {
        result.brief = sections._brief;
      }

      // Map common section headings
      const whatKeys = [
        "what this skill does",
        "what it does",
        "overview",
        "about",
        "description",
        "features",
      ];
      for (const key of whatKeys) {
        if (sections[key]) {
          result.whatItDoes = sections[key];
          break;
        }
      }

      const exampleKeys = [
        "example workflow",
        "example",
        "examples",
        "usage",
        "how to use",
        "quick start",
        "getting started",
      ];
      for (const key of exampleKeys) {
        if (sections[key]) {
          result.exampleWorkflow = sections[key];
          break;
        }
      }

      const reqKeys = [
        "requirements",
        "prerequisites",
        "dependencies",
        "setup",
        "installation",
        "install",
      ];
      for (const key of reqKeys) {
        if (sections[key]) {
          result.requirements = sections[key];
          break;
        }
      }

      // Build full description from the README if no specific section found
      if (!result.whatItDoes) {
        // Use the intro text (everything before the first ## section)
        const introEnd = readmeText.indexOf("\n## ");
        if (introEnd !== -1) {
          const intro = readmeText
            .substring(0, introEnd)
            .replace(/^#\s+.+\n/, "")
            .trim();
          if (intro.length > 20) {
            result.whatItDoes = intro;
          }
        }
      }

      if (!result.brief && result.whatItDoes) {
        result.brief = result.whatItDoes.split("\n")[0].substring(0, 200);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Auto-fill error:", error);
    return NextResponse.json({ error: "Failed to fetch data from URL" }, { status: 500 });
  }
}
