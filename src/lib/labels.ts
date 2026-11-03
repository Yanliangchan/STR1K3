import type { RecordType, StatementStatus } from "@prisma/client";

export const STATEMENT_STATUSES: StatementStatus[] = [
  "NOT_SUBMITTED",
  "PENDING_REVIEW",
  "REWRITE_REQUIRED",
  "ACCEPTED",
];

export const OUTSTANDING_STATUSES: StatementStatus[] = ["NOT_SUBMITTED", "PENDING_REVIEW", "REWRITE_REQUIRED"];

export const statementStatusLabel: Record<StatementStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  PENDING_REVIEW: "Pending review",
  REWRITE_REQUIRED: "Rewrite required",
  ACCEPTED: "Accepted",
};

export const recordTypeLabel: Record<RecordType | "STATEMENT", string> = {
  NOR: "NOR",
  CROW: "CROW",
  IPS: "IPS",
  STATEMENT: "Statement",
};

export const recordTypeLong: Record<RecordType | "STATEMENT", string> = {
  NOR: "NOR — Negative Observation Record",
  CROW: "CROW",
  IPS: "IPS — Informal Punishment System",
  STATEMENT: "Statement request",
};

/** Record types (stored in the Record table), in the order they appear in the UI. */
export const RECORD_TYPES = ["NOR", "CROW", "IPS"] as const;
/** Everything an instructor can create: the record types plus statement requests. */
export const ENTRY_TYPES = ["NOR", "CROW", "IPS", "STATEMENT"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export function isRecordType(v: unknown): v is RecordType {
  return typeof v === "string" && (RECORD_TYPES as readonly string[]).includes(v);
}

export function isStatementStatus(v: unknown): v is StatementStatus {
  return typeof v === "string" && (STATEMENT_STATUSES as string[]).includes(v);
}
