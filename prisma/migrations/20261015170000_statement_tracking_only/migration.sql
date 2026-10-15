-- Statements are tracked, not stored: drop statement content and instructions,
-- rename the request date to the issue date, and add submission deadlines.

ALTER TABLE "Statement" RENAME COLUMN "requestedOn" TO "issuedOn";
ALTER TABLE "Statement" DROP COLUMN "instructions";
ALTER TABLE "Statement" ADD COLUMN "dueAt" TIMESTAMP(3);
-- Backfill existing rows (end of the day after issue). The archived-batch
-- guard is suspended only for this one-off schema backfill.
ALTER TABLE "Statement" DISABLE TRIGGER statement_batch_writable;
UPDATE "Statement" SET "dueAt" = "issuedOn" + INTERVAL '1 day 23 hours 59 minutes' WHERE "dueAt" IS NULL;
ALTER TABLE "Statement" ENABLE TRIGGER statement_batch_writable;
ALTER TABLE "Statement" ALTER COLUMN "dueAt" SET NOT NULL;
CREATE INDEX "Statement_batchId_dueAt_idx" ON "Statement"("batchId", "dueAt");

ALTER TABLE "StatementVersion" DROP COLUMN "content";
ALTER TABLE "StatementVersion" ADD COLUMN "dueAt" TIMESTAMP(3);

ALTER TABLE "StatementReview" ADD COLUMN "newDueAt" TIMESTAMP(3);
