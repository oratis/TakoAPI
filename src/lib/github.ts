export interface GithubRepoInfo {
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  htmlUrl: string;
  defaultBranch: string;
  topics: string[];
  language: string | null;
  pushedAt: string | null;
}

const GH_API = "https://api.github.com";

function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchRepo(owner: string, repo: string): Promise<GithubRepoInfo | null> {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    owner: data.owner?.login ?? owner,
    repo: data.name ?? repo,
    description: data.description ?? null,
    stars: data.stargazers_count ?? 0,
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch ?? "main",
    topics: data.topics ?? [],
    language: data.language ?? null,
    pushedAt: data.pushed_at ?? null,
  };
}

export async function fetchReadme(owner: string, repo: string, branch = "main"): Promise<string | null> {
  const tryBranches = [branch, "master"];
  for (const b of tryBranches) {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`);
    if (res.ok) return await res.text();
  }
  return null;
}

export interface GithubSearchItem {
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  htmlUrl: string;
  topics: string[];
}

export async function searchRepos(
  query: string,
  opts: { perPage?: number; page?: number; sort?: "stars" | "updated" } = {}
): Promise<GithubSearchItem[]> {
  const { perPage = 30, page = 1, sort = "stars" } = opts;
  const url = `${GH_API}/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=${perPage}&page=${page}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub search failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.items || []).map((item: {
    full_name: string;
    owner: { login: string };
    name: string;
    description: string | null;
    stargazers_count: number;
    html_url: string;
    topics?: string[];
  }) => ({
    fullName: item.full_name,
    owner: item.owner.login,
    repo: item.name,
    description: item.description,
    stars: item.stargazers_count,
    htmlUrl: item.html_url,
    topics: item.topics || [],
  }));
}

export function extractGithubOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}
