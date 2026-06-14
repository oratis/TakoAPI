// ─────────────────────────────────────────────────────────────
// Scenario taxonomy — classifies marketplace agents by *what you'd
// use them for* (job-to-be-done), e.g. 前端开发 / 二级市场投资 / 做PPT.
//
// This is a SEPARATE dimension from the skill `Category` model (which is
// technical: "DevOps & Cloud", "AI & LLMs"…). Scenarios live on
// `Agent.scenarios` (a String[] of the slugs below) so an agent can span
// several use-cases, mirroring how `protocols` is filtered with `has`.
//
// The taxonomy + matching rules are defined in code (not the DB) so they
// stay reviewable and version-controlled. `classifyScenarios()` is the
// engine: it's run during GitHub ingestion, on agent submit, and by the
// one-off backfill script. Labels are bilingual (中文 · English).
// ─────────────────────────────────────────────────────────────

export interface Scenario {
  /** stable slug stored in Agent.scenarios and used in URLs */
  slug: string;
  /** English label */
  name: string;
  /** 中文 label */
  nameZh: string;
  /** emoji shown on chips/tiles */
  emoji: string;
  /** one-line bilingual blurb for the scenario landing/tooltip */
  blurb: string;
  /**
   * Match terms. ASCII terms match on word boundaries (so "art" won't hit
   * "smart"); CJK / non-ASCII terms match as substrings (CJK has no word
   * boundaries). Keep terms specific to avoid false positives on short
   * GitHub repo descriptions.
   */
  keywords: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    slug: "frontend",
    name: "Frontend",
    nameZh: "前端开发",
    emoji: "🎨",
    blurb: "前端开发 · UI, components, and web app development",
    keywords: [
      "frontend", "front-end", "front end", "react", "vue", "svelte", "angular",
      "tailwind", "css", "ui component", "design system", "nextjs", "next.js",
      "web ui", "web app", "前端", "组件",
    ],
  },
  {
    slug: "backend",
    name: "Backend",
    nameZh: "后端开发",
    emoji: "🧩",
    blurb: "后端开发 · APIs, services, and data layers",
    keywords: [
      "backend", "back-end", "back end", "api server", "rest api", "restful",
      "graphql", "microservice", "server-side", "postgres", "mysql", "mongodb",
      "database schema", "orm", "后端", "服务端", "接口",
    ],
  },
  {
    slug: "devops",
    name: "DevOps & Automation",
    nameZh: "运维自动化",
    emoji: "☁️",
    blurb: "运维自动化 · CI/CD, infra, deployment, and monitoring",
    keywords: [
      "devops", "ci/cd", "cicd", "kubernetes", "k8s", "docker", "terraform",
      "ansible", "deployment", "infrastructure", "monitoring", "observability",
      "sre", "cloud native", "pipeline automation", "运维", "部署", "自动化运维",
    ],
  },
  {
    slug: "data-analysis",
    name: "Data & Analytics",
    nameZh: "数据分析",
    emoji: "📊",
    blurb: "数据分析 · BI, dashboards, SQL, and data exploration",
    keywords: [
      "data analysis", "data analytics", "analytics", "dashboard",
      "business intelligence", "pandas", "jupyter", "sql query", "text-to-sql",
      "data visualization", "etl", "data pipeline", "spreadsheet",
      "数据分析", "报表", "数据可视化",
    ],
  },
  {
    slug: "product-design",
    name: "Product Design",
    nameZh: "产品设计",
    emoji: "✏️",
    blurb: "产品设计 · UX, prototyping, and product specs",
    keywords: [
      "product design", "ux", "user experience", "ui/ux", "figma", "wireframe",
      "prototype", "user research", "product manager", "product management",
      "prd", "design tool", "产品设计", "原型", "交互设计", "产品经理",
    ],
  },
  {
    slug: "creative",
    name: "Creative & Media",
    nameZh: "创意设计",
    emoji: "🖼️",
    blurb: "创意设计 · Image/video generation and media editing",
    keywords: [
      "image generation", "text-to-image", "video generation", "text-to-video",
      "illustration", "logo design", "photo editing", "stable diffusion",
      "midjourney", "art generation", "generative art", "creative tool",
      "绘画", "图像生成", "视频生成", "设计创意",
    ],
  },
  {
    slug: "presentations",
    name: "Presentations & Docs",
    nameZh: "演示/PPT",
    emoji: "📑",
    blurb: "演示/PPT · Slides, decks, and document generation",
    keywords: [
      "presentation", "slides", "slide deck", "powerpoint", "ppt", "pitch deck",
      "keynote", "document generation", "report generation", "docx",
      "幻灯片", "演示文稿", "做ppt", "ppt生成",
    ],
  },
  {
    slug: "investing",
    name: "Public-Market Investing",
    nameZh: "二级市场投资",
    emoji: "📈",
    blurb: "二级市场投资 · Trading, quant, and portfolio analysis",
    keywords: [
      "trading", "stock", "equities", "portfolio", "quant", "quantitative",
      "crypto", "cryptocurrency", "technical analysis", "backtest",
      "backtesting", "hedge fund", "financial market", "algo trading",
      "量化", "股票", "交易", "二级市场", "投资组合",
    ],
  },
  {
    slug: "venture-analysis",
    name: "VC & Business-Model",
    nameZh: "一级市场/商业模式",
    emoji: "🏦",
    blurb: "一级市场/商业模式 · Startup, VC, and business-model analysis",
    keywords: [
      "venture capital", "startup", "business model", "market research",
      "due diligence", "competitive analysis", "fundraising", "valuation",
      "business plan", "go-to-market", "market sizing", "investment thesis",
      "商业模式", "创业", "投融资", "尽调", "一级市场", "商业计划",
    ],
  },
  {
    slug: "marketing",
    name: "Marketing & Growth",
    nameZh: "营销增长",
    emoji: "📣",
    blurb: "营销增长 · SEO, ads, content, and growth",
    keywords: [
      "marketing", "seo", "growth hacking", "advertising", "ad campaign",
      "content marketing", "social media", "copywriting", "email marketing",
      "brand", "营销", "增长", "广告", "推广",
    ],
  },
  {
    slug: "sales",
    name: "Sales & CRM",
    nameZh: "销售/CRM",
    emoji: "🤝",
    blurb: "销售/CRM · Lead gen, outreach, and pipeline",
    keywords: [
      "sales", "crm", "lead generation", "lead gen", "outreach", "prospecting",
      "salesforce", "sales pipeline", "cold email", "销售", "客户管理", "线索",
    ],
  },
  {
    slug: "customer-support",
    name: "Customer Support",
    nameZh: "客户支持",
    emoji: "💬",
    blurb: "客户支持 · Helpdesk, chatbots, and ticketing",
    keywords: [
      "customer support", "customer service", "helpdesk", "help desk",
      "support agent", "chatbot", "ticketing", "faq bot", "客服", "客户支持",
      "工单",
    ],
  },
  {
    slug: "research",
    name: "Research & Search",
    nameZh: "研究检索",
    emoji: "🔍",
    blurb: "研究检索 · Deep research, web search, and retrieval",
    keywords: [
      "research", "deep research", "web search", "retrieval", "rag",
      "knowledge base", "scraping", "web scraping", "crawler", "search engine",
      "literature review", "检索", "研究", "搜索", "知识库",
    ],
  },
  {
    slug: "writing",
    name: "Writing & Content",
    nameZh: "写作内容",
    emoji: "✍️",
    blurb: "写作内容 · Blogging, copy, summarization, and translation",
    keywords: [
      "writing", "content generation", "blog", "article", "copywriter",
      "summarization", "summarize", "translation", "proofreading",
      "documentation generator", "写作", "文案", "翻译", "内容生成",
    ],
  },
  {
    slug: "productivity",
    name: "Productivity & Assistant",
    nameZh: "个人助理",
    emoji: "🗂️",
    blurb: "个人助理 · Calendar, email, notes, and task automation",
    keywords: [
      "personal assistant", "productivity", "calendar", "email assistant",
      "note-taking", "task management", "scheduling", "todo", "reminder",
      "workflow assistant", "助理", "日程", "待办", "效率工具",
    ],
  },
];

/** Max scenarios assigned to one agent — keeps cards/filters readable. */
export const MAX_SCENARIOS_PER_AGENT = 3;

export const SCENARIO_SLUGS: ReadonlySet<string> = new Set(SCENARIOS.map((s) => s.slug));

const BY_SLUG: ReadonlyMap<string, Scenario> = new Map(SCENARIOS.map((s) => [s.slug, s]));

export function findScenario(slug: string): Scenario | undefined {
  return BY_SLUG.get(slug);
}

export function isScenarioSlug(slug: string | null | undefined): slug is string {
  return !!slug && SCENARIO_SLUGS.has(slug);
}

/** Bilingual label, e.g. "前端开发 · Frontend". Accepts a slug or a Scenario. */
export function scenarioLabel(s: Scenario | string): string {
  const sc = typeof s === "string" ? BY_SLUG.get(s) : s;
  return sc ? `${sc.nameZh} · ${sc.name}` : String(s);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompile one matcher per keyword: ASCII terms use word boundaries so
// short terms ("art", "rag") don't match inside other words; CJK/non-ASCII
// terms match as substrings (word boundaries are ASCII-only).
const MATCHERS: ReadonlyArray<{ slug: string; res: RegExp[] }> = SCENARIOS.map((s) => ({
  slug: s.slug,
  res: s.keywords.map((kw) => {
    const esc = escapeRegExp(kw.toLowerCase());
    const isAscii = !/[^\x00-\x7f]/.test(kw);
    return new RegExp(isAscii ? `\\b${esc}\\b` : esc, "i");
  }),
}));

/**
 * Classify free text (agent name + description + repo topics) into scenario
 * slugs. Returns the best-matching slugs (by hit count, taxonomy order as
 * tie-break), capped at MAX_SCENARIOS_PER_AGENT. Deterministic; returns []
 * when nothing matches (leaving the agent unclassified rather than guessing).
 */
export function classifyScenarios(text: string | null | undefined): string[] {
  if (!text) return [];
  const hay = text.toLowerCase();
  const scored: { slug: string; score: number; order: number }[] = [];
  MATCHERS.forEach((m, order) => {
    let score = 0;
    for (const re of m.res) if (re.test(hay)) score++;
    if (score > 0) scored.push({ slug: m.slug, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, MAX_SCENARIOS_PER_AGENT).map((x) => x.slug);
}
