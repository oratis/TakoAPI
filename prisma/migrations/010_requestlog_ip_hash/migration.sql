-- Replace RequestLog's plaintext client IP with a salted, day-rotating hash.
--
-- DESTRUCTIVE, DELIBERATELY: the "ip" column is DROPPED rather than renamed. The
-- addresses already stored there are plaintext personal data with no retention
-- policy behind them, and they are not even reliable — they come from the first
-- element of a caller-supplied X-Forwarded-For (see extractClientIp), so they are
-- a privacy liability that is not usable as evidence either way. Keeping them
-- under a new name would preserve exactly the problem this change exists to
-- remove, and would leave "ipHash" holding values that are not hashes.
--
-- Nothing reads the column: `grep -rn '\.ip\b' src/` finds no reader, only the
-- single write in src/lib/requestLog.ts. Dropping it is code-safe.
--
-- If those rows are wanted for a one-off investigation, snapshot them BEFORE
-- applying this migration — afterwards they are gone.

ALTER TABLE "RequestLog" DROP COLUMN IF EXISTS "ip";
ALTER TABLE "RequestLog" ADD COLUMN IF NOT EXISTS "ipHash" TEXT;
