-- IPS (Informal Punishment System) records, repeat-offence matching settings,
-- synonym groups and "not the same offence" dismissals.
-- AlterEnum
ALTER TYPE "RecordType" ADD VALUE 'IPS';

-- AlterTable
ALTER TABLE "AppConfig" ADD COLUMN     "escalationRepeats" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "flagIpsThreshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "ignoredWords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "punishment" TEXT;

-- CreateTable
CREATE TABLE "SynonymGroup" (
    "id" TEXT NOT NULL,
    "terms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SynonymGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatDismissal" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "cadetId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "entryKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RepeatDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepeatDismissal_batchId_cadetId_idx" ON "RepeatDismissal"("batchId", "cadetId");

-- AddForeignKey
ALTER TABLE "SynonymGroup" ADD CONSTRAINT "SynonymGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatDismissal" ADD CONSTRAINT "RepeatDismissal_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatDismissal" ADD CONSTRAINT "RepeatDismissal_cadetId_batchId_fkey" FOREIGN KEY ("cadetId", "batchId") REFERENCES "Cadet"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatDismissal" ADD CONSTRAINT "RepeatDismissal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Dismissals follow their batch: read-only once archived, never moved, never deleted.
CREATE TRIGGER repeat_dismissal_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "RepeatDismissal"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER repeat_dismissal_no_delete BEFORE DELETE ON "RepeatDismissal"
  FOR EACH ROW EXECUTE FUNCTION str1k3_no_delete();
