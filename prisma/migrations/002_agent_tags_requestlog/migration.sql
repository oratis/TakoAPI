-- Agent classification, source metadata, tag join-table, and request logging.
-- Safe to re-run: all creates use IF NOT EXISTS where possible.

CREATE TYPE "AgentType" AS ENUM (
  'CLAUDE_CODE', 'CURSOR', 'WINDSURF', 'ZED', 'CODEX',
  'COPILOT', 'AIDER', 'CLINE', 'GENERIC'
);

CREATE TYPE "SkillSource" AS ENUM ('USER_SUBMITTED', 'GITHUB_SCRAPE', 'CURATED');

ALTER TABLE "Skill"
  ADD COLUMN "agentType" "AgentType" NOT NULL DEFAULT 'CLAUDE_CODE',
  ADD COLUMN "source" "SkillSource" NOT NULL DEFAULT 'USER_SUBMITTED',
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "ghStars" INTEGER,
  ADD COLUMN "ghOwner" TEXT,
  ADD COLUMN "ghRepo" TEXT;

CREATE INDEX IF NOT EXISTS "Skill_agentType_status_idx" ON "Skill"("agentType", "status");
CREATE INDEX IF NOT EXISTS "Skill_source_idx" ON "Skill"("source");
CREATE INDEX IF NOT EXISTS "Skill_ghOwner_ghRepo_idx" ON "Skill"("ghOwner", "ghRepo");

CREATE TABLE "Tag" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL UNIQUE,
  "slug"      TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SkillTag" (
  "skillId" TEXT NOT NULL,
  "tagId"   TEXT NOT NULL,
  PRIMARY KEY ("skillId", "tagId"),
  CONSTRAINT "SkillTag_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SkillTag_tagId_fkey"   FOREIGN KEY ("tagId")   REFERENCES "Tag"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SkillTag_tagId_idx" ON "SkillTag"("tagId");

CREATE TABLE "RequestLog" (
  "id"         TEXT PRIMARY KEY,
  "path"       TEXT NOT NULL,
  "method"     TEXT NOT NULL,
  "status"     INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "userId"     TEXT,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "errorCode"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RequestLog_createdAt_idx"         ON "RequestLog"("createdAt");
CREATE INDEX "RequestLog_path_createdAt_idx"    ON "RequestLog"("path", "createdAt");
CREATE INDEX "RequestLog_status_createdAt_idx" ON "RequestLog"("status", "createdAt");
