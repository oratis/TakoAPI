-- Phase 1A: Migrate Skill.status from TEXT to enum, add reviewNote, add indexes.
-- Preserves existing status values via USING clause (uppercase conversion).

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Normalize any unexpected legacy values to "approved" before enum conversion
UPDATE "Skill" SET "status" = 'approved'
  WHERE "status" NOT IN ('pending', 'approved', 'rejected');

-- Drop default (cannot keep a TEXT default while changing type)
ALTER TABLE "Skill" ALTER COLUMN "status" DROP DEFAULT;

-- Convert column type with data preservation (case-insensitive)
ALTER TABLE "Skill"
  ALTER COLUMN "status" TYPE "SkillStatus"
  USING (UPPER("status")::"SkillStatus");

-- Set new default: PENDING for future submissions (must go through review)
ALTER TABLE "Skill" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "Skill" ALTER COLUMN "status" SET NOT NULL;

-- New column for admin review notes
ALTER TABLE "Skill" ADD COLUMN "reviewNote" TEXT;

-- Update FK to ON DELETE SET NULL for submitter
ALTER TABLE "Skill" DROP CONSTRAINT IF EXISTS "Skill_submitterId_fkey";
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_submitterId_fkey"
  FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New indexes (non-conflicting with existing ones)
CREATE INDEX IF NOT EXISTS "Skill_status_categoryId_idx" ON "Skill"("status", "categoryId");
CREATE INDEX IF NOT EXISTS "Skill_featured_idx" ON "Skill"("featured");
CREATE INDEX IF NOT EXISTS "Skill_updatedAt_idx" ON "Skill"("updatedAt" DESC);
