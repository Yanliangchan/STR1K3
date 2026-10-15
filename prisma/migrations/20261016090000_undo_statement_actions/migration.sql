-- Undo support: a hand-in or review recorded in error is marked retracted
-- (never deleted), so the audit trail stays complete.
ALTER TABLE "StatementVersion" ADD COLUMN "retractedAt" TIMESTAMP(3), ADD COLUMN "retractedById" TEXT;
ALTER TABLE "StatementReview" ADD COLUMN "retractedAt" TIMESTAMP(3), ADD COLUMN "retractedById" TEXT;
