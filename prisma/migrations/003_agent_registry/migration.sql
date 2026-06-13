-- Agent registry (Phase 1 · "One API to access all agents").
-- Adds Agent / AgentSkillDef / AgentTag + AgentProtocol / AgentStatus / PricingModel enums.
-- Invokable third-party agents described by A2A AgentCards — distinct from Skill.agentType.
-- Purely additive (no changes to existing tables). See docs/agent-marketplace/04-data-model.md
-- Generated via `prisma migrate diff` (schema-to-schema); apply with `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "AgentProtocol" AS ENUM ('A2A', 'OPENAI_COMPAT', 'MCP');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FREE', 'PER_CALL', 'PER_TASK', 'PER_TOKEN');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "cardUrl" TEXT,
    "endpointUrl" TEXT NOT NULL,
    "protocols" "AgentProtocol"[] DEFAULT ARRAY[]::"AgentProtocol"[],
    "streaming" BOOLEAN NOT NULL DEFAULT false,
    "pushNotify" BOOLEAN NOT NULL DEFAULT false,
    "securitySchemes" JSONB,
    "cardSignatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "namespaceVerified" BOOLEAN NOT NULL DEFAULT false,
    "cardFetchedAt" TIMESTAMP(3),
    "healthStatus" TEXT,
    "healthCheckedAt" TIMESTAMP(3),
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FREE',
    "unitPriceUsd" DECIMAL(12,6),
    "byokSupported" BOOLEAN NOT NULL DEFAULT false,
    "homepage" TEXT,
    "logo" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "callsCount" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkillDef" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outputModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "examples" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "AgentSkillDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTag" (
    "agentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "AgentTag_pkey" PRIMARY KEY ("agentId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_status_categoryId_idx" ON "Agent"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Agent_featured_callsCount_idx" ON "Agent"("featured", "callsCount" DESC);

-- CreateIndex
CREATE INDEX "Agent_publisherId_idx" ON "Agent"("publisherId");

-- CreateIndex
CREATE INDEX "Agent_slug_idx" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_createdAt_idx" ON "Agent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentSkillDef_agentId_idx" ON "AgentSkillDef"("agentId");

-- CreateIndex
CREATE INDEX "AgentTag_tagId_idx" ON "AgentTag"("tagId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkillDef" ADD CONSTRAINT "AgentSkillDef_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTag" ADD CONSTRAINT "AgentTag_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTag" ADD CONSTRAINT "AgentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
