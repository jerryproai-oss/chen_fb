-- AlterTable
ALTER TABLE "family_events" ADD COLUMN "needs_car" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "family_events" ADD COLUMN "is_important" BOOLEAN NOT NULL DEFAULT false;
