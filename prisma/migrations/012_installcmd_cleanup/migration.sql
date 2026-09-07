-- Remove fabricated install commands.
--
-- Every skill row was written with installCmd = 'clawhub install <our slug>',
-- including skills scraped from GitHub or submitted with only a GitHub URL —
-- packages that do not exist on ClawHub, so the command fails for anyone who
-- copies it from the detail page. Only skills with a clawskills.sh listing have a
-- real install command; keep those, null the rest. The detail page now shows
-- GitHub install guidance when installCmd is null.
--
-- HOW TO APPLY IN PRODUCTION: `npx prisma db execute --url "$PROD_URL" --file
-- prisma/migrations/012_installcmd_cleanup/migration.sql` (see
-- docs/agent-marketplace/HANDOFF.md §5; do NOT run `prisma migrate deploy`).
-- Idempotent — safe to re-run. Pure data change, no schema change, so it can be
-- applied before or after the code deploy.

UPDATE "Skill"
SET "installCmd" = NULL
WHERE "installCmd" LIKE 'clawhub install %'
  AND "clawSkillsUrl" IS NULL
  AND "clawHubUrl" IS NULL;
