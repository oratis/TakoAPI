-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('HOSTED', 'PROJECT');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "githubUrl" TEXT,
ADD COLUMN     "kind" "AgentKind" NOT NULL DEFAULT 'HOSTED',
ADD COLUMN     "repoName" TEXT,
ADD COLUMN     "repoOwner" TEXT,
ADD COLUMN     "stars" INTEGER,
ALTER COLUMN "endpointUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Agent_status_kind_idx" ON "Agent"("status", "kind");

-- CreateIndex
CREATE INDEX "Agent_kind_stars_idx" ON "Agent"("kind", "stars" DESC);

