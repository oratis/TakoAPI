-- Scenario / use-case classification for marketplace agents.
-- Multi-valued (an agent can span several use-cases) and filtered with `@>`
-- (`has`), mirroring the existing "protocols" array column. Following the
-- established precedent for array columns here, no GIN index is added — the
-- catalog is small and `has` scans are cheap; add one later if it grows.

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "scenarios" TEXT[] DEFAULT ARRAY[]::TEXT[];
