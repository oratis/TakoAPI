# TakoAPI

**All in One OpenClaw Skills Marketplace** - for you and for your agent.

TakoAPI is a full-stack skills marketplace for the [OpenClaw](https://openclaw.org) ecosystem. Browse, search, and install 5,000+ community skills from the web or programmatically through agent-friendly API endpoints.

Live at [takoapi.com](https://takoapi.com)

## Features

- **Skills Discovery** - Browse 5,000+ skills across 30 categories, with search, filtering, and trending leaderboard
- **Agent API** - Dedicated `/api/agent` endpoint returns Markdown or JSON, designed for AI agents to discover and install skills
- **User Accounts** - Sign in with Google, Apple, or email/password. Agents can register via API and receive an API key
- **Community Features** - Like skills, track views, submit new skills with GitHub or ClawSkills.sh URLs
- **Skill Detail Pages** - Structured README with "What It Does", "When to Use It", "Example Workflow", and install commands

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) + TypeScript |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Database | PostgreSQL + [Prisma 6](https://prisma.io) |
| Auth | [NextAuth v5](https://authjs.dev) (Google, Apple, Credentials) |
| Deployment | Docker, Google Cloud Run, Cloud Build |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### Setup

```bash
# Clone the repo
git clone https://github.com/anthropics/TakoAPI.git
cd TakoAPI

# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d db

# Copy env file and configure
cp .env.example .env
# Edit .env with your database credentials and OAuth keys

# Push schema and seed data
npx prisma db push
npx tsx prisma/seed.ts

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Random secret for NextAuth sessions |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional) |
| `APPLE_CLIENT_ID` | Apple OAuth client ID (optional) |
| `APPLE_CLIENT_SECRET` | Apple OAuth client secret (optional) |

## API Reference

### Agent Endpoint

```
GET /api/agent
```

Returns a curated list of skills in Markdown (default) or JSON format. Designed for AI agents.

| Param | Description |
|-------|-------------|
| `format` | `md` (default) or `json` |
| `category` | Filter by category slug |
| `q` | Search query |

### Skills

```
GET    /api/skills              # List skills (paginated, sortable)
GET    /api/skills/search?q=    # Full-text search
GET    /api/skills/:id          # Skill detail (by ID or slug)
POST   /api/skills/submit       # Submit a new skill (auth required)
POST   /api/skills/:id/like     # Toggle like (auth required)
```

### Auth

```
POST   /api/auth/register       # Register (supports isAgent flag for API key)
GET    /api/categories           # List all categories
GET    /api/user/skills          # Current user's skills (auth required)
```

## Project Structure

```
src/
  app/
    page.tsx                 # Home page
    skills/                  # Browse & detail pages
    trending/                # Trending leaderboard
    submit/                  # Submit skill form
    profile/                 # User dashboard
    auth/                    # Sign in / sign up
    api/                     # API routes
  components/
    layout/                  # Header, Footer
    ui/                      # SkillCard, HomeSearch, CategoryBadge
  lib/
    auth.ts                  # NextAuth config
    prisma.ts                # Prisma client singleton
    utils.ts                 # Helpers (slugify, formatNumber, cn)
prisma/
  schema.prisma              # Database schema
  seed.ts                    # Database seeder
  seed-data.json             # Initial skill data (5,147 skills)
scripts/
  parse-skills.ts            # Parse awesome-openclaw-skills README
  scrape-skill-details.ts    # Scrape detail pages from ClawSkills.sh
```

## Database Schema

Core models:

- **User** - Accounts with optional API key for agent access
- **Skill** - Name, description, readme, install command, stats (views, likes, downloads, stars)
- **Category** - 30 skill categories with counts
- **Like** - User-skill relationship (unique per pair)

See [`prisma/schema.prisma`](prisma/schema.prisma) for the full schema.

## Deployment

### Docker

```bash
docker compose up
```

This starts PostgreSQL and the Next.js app (port 3000).

### Google Cloud

The project includes `cloudbuild.yaml` for Cloud Build -> Cloud Run deployment:

```bash
gcloud builds submit
```

## Scripts

```bash
# Parse skills from awesome-openclaw-skills README into seed-data.json
npx tsx scripts/parse-skills.ts

# Seed the database from seed-data.json
npx tsx prisma/seed.ts

# Scrape detailed skill info from ClawSkills.sh (requires running DB)
npx tsx scripts/scrape-skill-details.ts
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repo
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

[MIT](LICENSE)
