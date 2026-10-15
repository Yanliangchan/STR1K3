-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('NOR', 'CROW');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ByteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CadetStatus" AS ENUM ('ACTIVE', 'REMOVED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'REWRITE_REQUIRED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('ACCEPTED', 'REWRITE_REQUIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeBatchId" TEXT,
    "recurringThreshold" INTEGER NOT NULL DEFAULT 3,
    "recurringWindowDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "recordType" "RecordType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "expectedSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveNote" TEXT,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Byte" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ByteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Byte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cadet" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "byteId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "status" "CadetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "transferredFromId" TEXT,

    CONSTRAINT "Cadet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occurredOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOperation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "BulkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "cadetId" TEXT NOT NULL,
    "type" "RecordType" NOT NULL,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "referenceNo" TEXT,
    "occurredOn" DATE NOT NULL,
    "occurredTime" TEXT,
    "occurrenceId" TEXT,
    "bulkOperationId" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "cadetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "notes" TEXT,
    "status" "StatementStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "requestedOn" DATE NOT NULL,
    "lastReceivedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "occurrenceId" TEXT,
    "bulkOperationId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementVersion" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementReview" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "versionId" TEXT,
    "outcome" "ReviewOutcome" NOT NULL,
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT NOT NULL,

    CONSTRAINT "StatementReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "batchId" TEXT,
    "cadetId" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "reason" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_activeBatchId_key" ON "AppConfig"("activeBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_recordType_name_key" ON "Category"("recordType", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_name_key" ON "Batch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Byte_batchId_name_key" ON "Byte"("batchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Byte_id_batchId_key" ON "Byte"("id", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Cadet_transferredFromId_key" ON "Cadet"("transferredFromId");

-- CreateIndex
CREATE INDEX "Cadet_batchId_status_idx" ON "Cadet"("batchId", "status");

-- CreateIndex
CREATE INDEX "Cadet_batchId_byteId_idx" ON "Cadet"("batchId", "byteId");

-- CreateIndex
CREATE UNIQUE INDEX "Cadet_id_batchId_key" ON "Cadet"("id", "batchId");

-- CreateIndex
CREATE INDEX "Occurrence_batchId_createdAt_idx" ON "Occurrence"("batchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_id_batchId_key" ON "Occurrence"("id", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "BulkOperation_idempotencyKey_key" ON "BulkOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Record_batchId_type_status_idx" ON "Record"("batchId", "type", "status");

-- CreateIndex
CREATE INDEX "Record_cadetId_idx" ON "Record"("cadetId");

-- CreateIndex
CREATE INDEX "Record_batchId_occurredOn_idx" ON "Record"("batchId", "occurredOn");

-- CreateIndex
CREATE INDEX "Record_occurrenceId_idx" ON "Record"("occurrenceId");

-- CreateIndex
CREATE INDEX "Statement_batchId_status_voided_idx" ON "Statement"("batchId", "status", "voided");

-- CreateIndex
CREATE INDEX "Statement_cadetId_idx" ON "Statement"("cadetId");

-- CreateIndex
CREATE INDEX "Statement_occurrenceId_idx" ON "Statement"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementVersion_statementId_versionNumber_key" ON "StatementVersion"("statementId", "versionNumber");

-- CreateIndex
CREATE INDEX "StatementReview_statementId_reviewedAt_idx" ON "StatementReview"("statementId", "reviewedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_batchId_createdAt_idx" ON "AuditEvent"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_cadetId_idx" ON "AuditEvent"("cadetId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppConfig" ADD CONSTRAINT "AppConfig_activeBatchId_fkey" FOREIGN KEY ("activeBatchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Byte" ADD CONSTRAINT "Byte_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cadet" ADD CONSTRAINT "Cadet_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cadet" ADD CONSTRAINT "Cadet_byteId_fkey" FOREIGN KEY ("byteId") REFERENCES "Byte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cadet" ADD CONSTRAINT "Cadet_transferredFromId_fkey" FOREIGN KEY ("transferredFromId") REFERENCES "Cadet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOperation" ADD CONSTRAINT "BulkOperation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOperation" ADD CONSTRAINT "BulkOperation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_cadetId_batchId_fkey" FOREIGN KEY ("cadetId", "batchId") REFERENCES "Cadet"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_bulkOperationId_fkey" FOREIGN KEY ("bulkOperationId") REFERENCES "BulkOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_cadetId_batchId_fkey" FOREIGN KEY ("cadetId", "batchId") REFERENCES "Cadet"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_bulkOperationId_fkey" FOREIGN KEY ("bulkOperationId") REFERENCES "BulkOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementVersion" ADD CONSTRAINT "StatementVersion_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementVersion" ADD CONSTRAINT "StatementVersion_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementReview" ADD CONSTRAINT "StatementReview_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementReview" ADD CONSTRAINT "StatementReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "StatementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementReview" ADD CONSTRAINT "StatementReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Integrity rules that Prisma cannot express directly.
-- ===========================================================================

-- AppConfig is a singleton. Its unique activeBatchId guarantees that at most
-- one batch is active at any time.
ALTER TABLE "AppConfig" ADD CONSTRAINT "AppConfig_singleton" CHECK ("id" = 1);
ALTER TABLE "AppConfig" ADD CONSTRAINT "AppConfig_threshold_positive" CHECK ("recurringThreshold" >= 2);
ALTER TABLE "AppConfig" ADD CONSTRAINT "AppConfig_window_positive" CHECK ("recurringWindowDays" IS NULL OR "recurringWindowDays" > 0);
INSERT INTO "AppConfig" ("id", "recurringThreshold", "updatedAt") VALUES (1, 3, NOW()) ON CONFLICT DO NOTHING;

ALTER TABLE "StatementVersion" ADD CONSTRAINT "StatementVersion_number_positive" CHECK ("versionNumber" >= 1);
ALTER TABLE "Record" ADD CONSTRAINT "Record_time_format" CHECK ("occurredTime" IS NULL OR "occurredTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Only an OPEN batch can be designated active.
CREATE OR REPLACE FUNCTION str1k3_active_batch_open() RETURNS trigger AS $$
BEGIN
  IF NEW."activeBatchId" IS NOT NULL AND
     (SELECT "status" FROM "Batch" WHERE "id" = NEW."activeBatchId") <> 'OPEN' THEN
    RAISE EXCEPTION 'STR1K3: an archived batch cannot be the active batch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER appconfig_active_batch_open BEFORE INSERT OR UPDATE ON "AppConfig"
  FOR EACH ROW EXECUTE FUNCTION str1k3_active_batch_open();

-- The active batch cannot be archived.
CREATE OR REPLACE FUNCTION str1k3_batch_archive_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'ARCHIVED' AND OLD."status" <> 'ARCHIVED' AND
     EXISTS (SELECT 1 FROM "AppConfig" WHERE "activeBatchId" = NEW."id") THEN
    RAISE EXCEPTION 'STR1K3: the active batch cannot be archived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER batch_archive_guard BEFORE UPDATE ON "Batch"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_archive_guard();

-- A cadet's byte must belong to the cadet's batch.
CREATE OR REPLACE FUNCTION str1k3_cadet_byte_same_batch() RETURNS trigger AS $$
BEGIN
  IF NEW."byteId" IS NOT NULL AND
     NOT EXISTS (SELECT 1 FROM "Byte" WHERE "id" = NEW."byteId" AND "batchId" = NEW."batchId") THEN
    RAISE EXCEPTION 'STR1K3: byte does not belong to the cadet''s batch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER cadet_byte_same_batch BEFORE INSERT OR UPDATE ON "Cadet"
  FOR EACH ROW EXECUTE FUNCTION str1k3_cadet_byte_same_batch();

-- Records and statements may only link to an occurrence in their own batch.
CREATE OR REPLACE FUNCTION str1k3_occurrence_same_batch() RETURNS trigger AS $$
BEGIN
  IF NEW."occurrenceId" IS NOT NULL AND
     NOT EXISTS (SELECT 1 FROM "Occurrence" WHERE "id" = NEW."occurrenceId" AND "batchId" = NEW."batchId") THEN
    RAISE EXCEPTION 'STR1K3: occurrence does not belong to this batch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER record_occurrence_same_batch BEFORE INSERT OR UPDATE ON "Record"
  FOR EACH ROW EXECUTE FUNCTION str1k3_occurrence_same_batch();
CREATE TRIGGER statement_occurrence_same_batch BEFORE INSERT OR UPDATE ON "Statement"
  FOR EACH ROW EXECUTE FUNCTION str1k3_occurrence_same_batch();

-- Archived batches are read-only.
CREATE OR REPLACE FUNCTION str1k3_batch_writable() RETURNS trigger AS $$
DECLARE
  b TEXT;
BEGIN
  IF TG_TABLE_NAME IN ('StatementVersion', 'StatementReview') THEN
    IF TG_OP = 'DELETE' THEN
      SELECT "batchId" INTO b FROM "Statement" WHERE "id" = OLD."statementId";
    ELSE
      SELECT "batchId" INTO b FROM "Statement" WHERE "id" = NEW."statementId";
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    b := OLD."batchId";
  ELSE
    b := NEW."batchId";
  END IF;
  IF EXISTS (SELECT 1 FROM "Batch" WHERE "id" = b AND "status" = 'ARCHIVED') THEN
    RAISE EXCEPTION 'STR1K3: batch is archived and read-only' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME NOT IN ('StatementVersion', 'StatementReview') THEN
      IF OLD."batchId" <> NEW."batchId" THEN
        RAISE EXCEPTION 'STR1K3: rows cannot be moved between batches' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER byte_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "Byte"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER cadet_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "Cadet"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER occurrence_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "Occurrence"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER record_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "Record"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER statement_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "Statement"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER statement_version_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "StatementVersion"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();
CREATE TRIGGER statement_review_batch_writable BEFORE INSERT OR UPDATE OR DELETE ON "StatementReview"
  FOR EACH ROW EXECUTE FUNCTION str1k3_batch_writable();

-- Records, statements and statement versions are never hard-deleted.
CREATE OR REPLACE FUNCTION str1k3_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'STR1K3: % rows cannot be deleted; void them instead', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER record_no_delete BEFORE DELETE ON "Record"
  FOR EACH ROW EXECUTE FUNCTION str1k3_no_delete();
CREATE TRIGGER statement_no_delete BEFORE DELETE ON "Statement"
  FOR EACH ROW EXECUTE FUNCTION str1k3_no_delete();
CREATE TRIGGER statement_version_no_delete BEFORE DELETE ON "StatementVersion"
  FOR EACH ROW EXECUTE FUNCTION str1k3_no_delete();
CREATE TRIGGER statement_review_no_delete BEFORE DELETE ON "StatementReview"
  FOR EACH ROW EXECUTE FUNCTION str1k3_no_delete();

-- Audit history is append-only.
CREATE OR REPLACE FUNCTION str1k3_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'STR1K3: audit events are append-only' USING ERRCODE = 'insufficient_privilege';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION str1k3_audit_append_only();
