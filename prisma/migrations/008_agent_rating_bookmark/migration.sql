-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AgentRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRating_agentId_idx" ON "AgentRating"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRating_userId_agentId_key" ON "AgentRating"("userId", "agentId");

-- CreateIndex
CREATE INDEX "AgentBookmark_userId_idx" ON "AgentBookmark"("userId");

-- CreateIndex
CREATE INDEX "AgentBookmark_agentId_idx" ON "AgentBookmark"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentBookmark_userId_agentId_key" ON "AgentBookmark"("userId", "agentId");

-- AddForeignKey
ALTER TABLE "AgentRating" ADD CONSTRAINT "AgentRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRating" ADD CONSTRAINT "AgentRating_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBookmark" ADD CONSTRAINT "AgentBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBookmark" ADD CONSTRAINT "AgentBookmark_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

