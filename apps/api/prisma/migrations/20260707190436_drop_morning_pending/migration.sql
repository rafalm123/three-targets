-- AlterEnum
BEGIN;
CREATE TYPE "day_status_new" AS ENUM ('evening_pending', 'closed');
ALTER TABLE "public"."day" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "day" ALTER COLUMN "status" TYPE "day_status_new" USING ("status"::text::"day_status_new");
ALTER TYPE "day_status" RENAME TO "day_status_old";
ALTER TYPE "day_status_new" RENAME TO "day_status";
DROP TYPE "public"."day_status_old";
ALTER TABLE "day" ALTER COLUMN "status" SET DEFAULT 'evening_pending';
COMMIT;

-- AlterTable
ALTER TABLE "day" ALTER COLUMN "status" SET DEFAULT 'evening_pending';

