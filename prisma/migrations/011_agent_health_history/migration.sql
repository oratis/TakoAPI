-- Health-transition history for agents.
--
-- Agent.healthStatus / healthCheckedAt are overwritten in place by the hourly cron,
-- so the only answerable question was "what is it right now". This table records a
-- row each time the probed status *differs* from the stored one, which makes "when
-- did it go down", "how long was it down", and "what was its uptime last week"
-- answerable, while keeping the table proportional to flips rather than to
-- (agent count x hours).

CREATE TABLE IF NOT EXISTS "AgentHealthCheck" (
  "id"             TEXT PRIMARY KEY,
  "agentId"        TEXT NOT NULL,
  "status"         TEXT NOT NULL,
  "previousStatus" TEXT,
  "checkedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentHealthCheck_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AgentHealthCheck_agentId_checkedAt_idx" ON "AgentHealthCheck"("agentId", "checkedAt");
CREATE INDEX IF NOT EXISTS "AgentHealthCheck_checkedAt_idx"          ON "AgentHealthCheck"("checkedAt");
