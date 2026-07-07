-- DropIndex
DROP INDEX "goal_dayId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "goal_dayId_kind_position_key" ON "goal"("dayId", "kind", "position");

