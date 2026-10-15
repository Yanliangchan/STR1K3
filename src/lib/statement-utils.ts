import type { StatementStatus } from "@prisma/client";

/** Still waiting on the cadet and past the deadline. */
export function isOverdue(s: { status: StatementStatus; voided?: boolean; dueAt: Date }, now = new Date()) {
  return !s.voided && (s.status === "NOT_SUBMITTED" || s.status === "REWRITE_REQUIRED") && s.dueAt < now;
}

/** Waiting on the cadet (as opposed to waiting on the instructor). */
export function awaitingCadet(status: StatementStatus) {
  return status === "NOT_SUBMITTED" || status === "REWRITE_REQUIRED";
}
