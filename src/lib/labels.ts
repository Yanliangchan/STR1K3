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
  STATEMENT: "Statement",
};

export const recordTypeLong: Record<RecordType | "STATEMENT", string> = {
  NOR: "NOR — Negative Observation Record",
  CROW: "CROW",
  STATEMENT: "Statement request",
};

export function isStatementStatus(v: unknown): v is StatementStatus {
  return typeof v === "string" && (STATEMENT_STATUSES as string[]).includes(v);
}
