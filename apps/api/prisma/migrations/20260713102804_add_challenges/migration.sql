-- CreateTable
CREATE TABLE "challenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_tier" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "reward" TEXT NOT NULL,

    CONSTRAINT "reward_tier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenge_userId_idx" ON "challenge"("userId");

-- CreateIndex
CREATE INDEX "reward_tier_challengeId_idx" ON "reward_tier"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "reward_tier_challengeId_threshold_key" ON "reward_tier"("challengeId", "threshold");

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_tier" ADD CONSTRAINT "reward_tier_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
