-- Make catalogue search use an index instead of scanning the table.
--
-- Every search path in the app — /api/skills/search, /api/skills, /api/agents,
-- /api/registry, /api/agent and the two marketplace pages — filters with
-- `contains` + `mode: "insensitive"`, which Prisma emits as `ILIKE '%q%'`. A
-- leading wildcard makes the existing btree indexes on Skill(name) and
-- Agent(slug) useless, so each of those queries is a sequential scan: ~5.4k
-- Skill rows and ~1.6k Agent rows today, on a db-f1-micro with one shared vCPU,
-- for every keystroke-driven search and every MCP `search_agents` call.
--
-- Trigram GIN indexes are the fix that needs no query rewrite: pg_trgm can serve
-- `ILIKE '%…%'` directly, so the application code stays exactly as it is and the
-- planner starts using an index. (A tsvector column would rank better but would
-- require rewriting every call site in raw SQL and keeping the column in sync —
-- worth doing later, not needed to stop the scans.)
--
-- Also adds a GIN index on Agent.scenarios: migration 007 deliberately skipped it
-- ("the catalog is small and `has` scans are cheap"), which was true at ~500
-- agents. It is now the filter behind every scenario tile on the home page, the
-- /scenarios index and every /agents?scenario= view, over 1.6k rows.
--
-- HOW TO APPLY IN PRODUCTION: `npx prisma db execute --url "$PROD_URL" --file
-- prisma/migrations/014_search_indexes/migration.sql`, per
-- docs/agent-marketplace/HANDOFF.md §5. Do NOT run `prisma migrate deploy` — see
-- the note in prisma/migrations/010_requestlog_ip_hash/migration.sql.
--
-- Safe to re-run. CREATE INDEX (without CONCURRENTLY) takes a brief ACCESS
-- EXCLUSIVE lock on each table; at this row count that is well under a second.
-- Prisma's `db execute` runs statements in one implicit transaction, which is why
-- CONCURRENTLY is not used here — it cannot run inside a transaction block.
--
-- These indexes are intentionally absent from schema.prisma: Prisma has no
-- representation for a GIN/gin_trgm_ops index, and introspecting them back would
-- produce an unrepresentable-index warning. They are managed here.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Skill: name and description are both searched, always together in an OR.
CREATE INDEX IF NOT EXISTS "Skill_name_trgm_idx"
  ON "Skill" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Skill_description_trgm_idx"
  ON "Skill" USING gin ("description" gin_trgm_ops);
-- `author` is searched by /api/skills/search only.
CREATE INDEX IF NOT EXISTS "Skill_author_trgm_idx"
  ON "Skill" USING gin ("author" gin_trgm_ops);

-- Agent: same pair, hit by the marketplace, the registry and the MCP tool.
CREATE INDEX IF NOT EXISTS "Agent_name_trgm_idx"
  ON "Agent" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Agent_description_trgm_idx"
  ON "Agent" USING gin ("description" gin_trgm_ops);

-- Array containment for `scenarios: { has: … }`.
CREATE INDEX IF NOT EXISTS "Agent_scenarios_gin_idx"
  ON "Agent" USING gin ("scenarios");

-- Sorting the public catalogue: every listing filters on status and then orders by
-- one of these, and the existing composite indexes do not cover the combination.
CREATE INDEX IF NOT EXISTS "Agent_status_kind_stars_idx"
  ON "Agent" ("status", "kind", "stars" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "Agent_status_kind_callsCount_idx"
  ON "Agent" ("status", "kind", "callsCount" DESC);
CREATE INDEX IF NOT EXISTS "Skill_status_createdAt_idx"
  ON "Skill" ("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Skill_status_likesCount_idx"
  ON "Skill" ("status", "likesCount" DESC);

-- The submissions list on /profile and /api/user/skills.
CREATE INDEX IF NOT EXISTS "Skill_submitterId_createdAt_idx"
  ON "Skill" ("submitterId", "createdAt" DESC);

-- SkillEvent is now written on every deduplicated page view; the dedupe probe
-- looks up (skillId, type, referrer) and the sweep deletes by (type, createdAt).
CREATE INDEX IF NOT EXISTS "SkillEvent_skillId_type_referrer_idx"
  ON "SkillEvent" ("skillId", "type", "referrer");
-- …and the retention sweep deletes by (type, createdAt).
CREATE INDEX IF NOT EXISTS "SkillEvent_type_createdAt_idx"
  ON "SkillEvent" ("type", "createdAt");
