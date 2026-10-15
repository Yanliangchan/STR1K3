-- Thresholds for flagging cadets on the dashboard (review prompts, not rules).
ALTER TABLE "AppConfig" ADD COLUMN "flagRecordThreshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "AppConfig" ADD COLUMN "flagStatementThreshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "AppConfig" ADD CONSTRAINT "AppConfig_flag_thresholds_positive" CHECK ("flagRecordThreshold" >= 1 AND "flagStatementThreshold" >= 1);
