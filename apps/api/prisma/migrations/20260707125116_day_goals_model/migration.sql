-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('morning_pending', 'evening_pending', 'closed');

-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('main', 'secondary');

-- CreateTable
CREATE TABLE "day" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "morningNote" TEXT,
    "eveningNote" TEXT,
    "status" "DayStatus" NOT NULL DEFAULT 'morning_pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "kind" "GoalKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "completed" BOOLEAN,
    "completedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_userId_idx" ON "day"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "day_userId_date_key" ON "day"("userId", "date");

-- CreateIndex
CREATE INDEX "goal_dayId_idx" ON "goal"("dayId");

-- AddForeignKey
ALTER TABLE "day" ADD CONSTRAINT "day_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
