-- The original bulk import predates SkillSource and inherited its user-submitted default.
-- A linked submitter or a non-canonical source URL is not evidence of that import.
UPDATE "Skill" SET source = 'CURATED'
WHERE source = 'USER_SUBMITTED' AND "submitterId" IS NULL
  AND "clawSkillsUrl" = 'https://clawskills.sh/skills/' || slug;
