-- AlterTable
ALTER TABLE "family_events" ADD COLUMN     "color" TEXT DEFAULT '#5a7a5a',
ADD COLUMN     "end_date" DATE,
ADD COLUMN     "end_time" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "recurring_end_date" DATE;
