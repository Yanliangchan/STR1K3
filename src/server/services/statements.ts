/**
 * Statement tracking. STR1K3 does not store statement content — it tracks
 * whether each cadet has handed in their statement, by when, and the outcome.
 *
 * Statuses and allowed transitions:
 *   NOT_SUBMITTED    -> PENDING_REVIEW   (hand-in recorded; creates submission 1)
 *   PENDING_REVIEW   -> ACCEPTED | REWRITE_REQUIRED (rewrite sets a new deadline)
 *   REWRITE_REQUIRED -> PENDING_REVIEW   (rewrite handed in; creates a new submission)
 *   ACCEPTED         -> PENDING_REVIEW | REWRITE_REQUIRED only via explicit reopen with a reason
 * Submissions and reviews are append-only; nothing is overwritten.
 */
import { z } from "zod";
import type { Prisma, StatementStatus } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { diff, writeAudit } from "@/server/audit";
import { conflict, invalid, notFound, readOnly } from "@/server/errors";
import { id, isoDate, optionalText, parse, reason, requiredText } from "@/server/validation";
import { dateOnlyISO, formatDeadline, parseISODate, startOfDayInTz, todayISO, toTimeInTz, toISODateInTz, zonedDateTime } from "@/lib/dates";
import { statementStatusLabel, STATEMENT_STATUSES } from "@/lib/labels";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export type StatementListQuery = {
  status?: StatementStatus | "OUTSTANDING" | "OVERDUE";
  byteId?: string;
  cadetId?: string;
  from?: string;
  to?: string;
  q?: string;
  includeVoided?: boolean;
  occurrenceId?: string;
};

/** Overdue = still waiting on the cadet (not submitted / rewrite) and past the deadline. */
export function overdueWhere(now = new Date()): Prisma.StatementWhereInput {
  return { voided: false, status: { in: ["NOT_SUBMITTED", "REWRITE_REQUIRED"] }, dueAt: { lt: now } };
}

export function statementWhere(batchId: string, f: StatementListQuery): Prisma.StatementWhereInput {
  return {
    batchId,
    ...(f.includeVoided ? {} : { voided: false }),
    ...(f.status === "OUTSTANDING"
      ? { status: { in: ["NOT_SUBMITTED", "PENDING_REVIEW", "REWRITE_REQUIRED"] } }
      : f.status === "OVERDUE"
        ? overdueWhere()
        : f.status
          ? { status: f.status }
          : {}),
    ...(f.cadetId ? { cadetId: f.cadetId } : {}),
    ...(f.byteId ? { cadet: { byteId: f.byteId } } : {}),
    ...(f.occurrenceId ? { occurrenceId: f.occurrenceId } : {}),
    ...(f.from || f.to
      ? {
          issuedOn: {
            ...(f.from ? { gte: parseISODate(f.from) } : {}),
            ...(f.to ? { lte: parseISODate(f.to) } : {}),
          },
        }
      : {}),
    ...(f.q
      ? {
          OR: [
            { title: { contains: f.q, mode: "insensitive" } },
            { cadet: { name: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const STATUS_ORDER: Record<StatementStatus, number> = {
  NOT_SUBMITTED: 0,
  REWRITE_REQUIRED: 0,
  PENDING_REVIEW: 1,
  ACCEPTED: 2,
};

export async function listStatements(batchId: string, f: StatementListQuery = {}, take = 300) {
  const where = statementWhere(batchId, f);
  const [rows, total] = await Promise.all([
    prisma.statement.findMany({
      where,
      include: {
        cadet: { include: { byte: true } },
        _count: { select: { versions: { where: { retractedAt: null } } } },
        versions: { where: { retractedAt: null }, orderBy: { versionNumber: "desc" }, take: 1, select: { receivedAt: true, dueAt: true } },
      },
      orderBy: [{ dueAt: "asc" }],
      take,
    }),
    prisma.statement.count({ where }),
  ]);
  // Waiting on cadets (soonest/overdue deadline first), then waiting on review, then accepted.
  rows.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s) return s;
    if (a.status === "ACCEPTED") return b.updatedAt.getTime() - a.updatedAt.getTime();
    if (a.status === "PENDING_REVIEW") return (a.lastReceivedAt?.getTime() ?? 0) - (b.lastReceivedAt?.getTime() ?? 0);
    return a.dueAt.getTime() - b.dueAt.getTime();
  });
  return { rows, total };
}

export async function getStatement(statementId: string, batchId?: string) {
  const s = await prisma.statement.findUnique({
    where: { id: statementId },
    include: {
      batch: true,
      cadet: { include: { byte: true } },
      occurrence: true,
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          recordedBy: { select: { name: true } },
          reviews: { orderBy: { reviewedAt: "asc" }, include: { reviewedBy: { select: { name: true } } } },
        },
      },
      reviews: { orderBy: { reviewedAt: "asc" }, include: { reviewedBy: { select: { name: true } } } },
    },
  });
  if (!s || (batchId && s.batchId !== batchId)) throw notFound("Statement");
  return s;
}

type Loaded = Awaited<ReturnType<typeof loadForWrite>>;

async function loadForWrite(statementId: string, expectedStatus?: StatementStatus) {
  const s = await prisma.statement.findUnique({
    where: { id: statementId },
    include: { batch: true, cadet: true, versions: { where: { retractedAt: null }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!s) throw notFound("Statement");
  if (s.batch.status !== "OPEN") throw readOnly();
  if (s.voided) throw conflict("This statement has been voided.");
  if (expectedStatus && s.status !== expectedStatus) {
    throw conflict(
      `This statement is now "${statementStatusLabel[s.status]}". It may have been updated elsewhere — reload and try again.`,
    );
  }
  return s;
}

/** Move status with an optimistic check so concurrent updates cannot clobber each other. */
async function moveStatus(
  tx: Tx,
  s: { id: string; status: StatementStatus },
  to: StatementStatus,
  actorId: string,
  extra: Prisma.StatementUpdateManyMutationInput = {},
) {
  const res = await tx.statement.updateMany({
    where: { id: s.id, status: s.status, voided: false },
    data: { status: to, updatedById: actorId, updatedAt: new Date(), ...extra },
  });
  if (res.count !== 1) throw conflict("This statement was updated elsewhere. Reload and try again.");
}

function deadlineFrom(date: string | null | undefined, time: string | null | undefined, field = "newDueDate") {
  if (!date) throw invalid("Set a new deadline.", { [field]: "Set a new deadline." });
  return zonedDateTime(date, time || "23:59");
}

const receiptSchema = z.object({
  statementId: id,
  receivedOn: isoDate.optional(),
  receivedTime: hhmm,
  expectedStatus: z.enum(STATEMENT_STATUSES as [StatementStatus, ...StatementStatus[]]).optional(),
});

/** Record that a statement (or a rewrite) has been handed in. Always lands in PENDING_REVIEW. */
export async function recordReceipt(actor: Actor, input: z.input<typeof receiptSchema>) {
  const data = parse(receiptSchema, input);
  const s = await loadForWrite(data.statementId, data.expectedStatus);
  if (s.status !== "NOT_SUBMITTED" && s.status !== "REWRITE_REQUIRED") {
    throw conflict(`A hand-in cannot be recorded while the statement is "${statementStatusLabel[s.status]}".`);
  }
  const receivedAt = receivedAtFor(data.receivedOn, data.receivedTime);
  return prisma.$transaction((tx) => receiptTx(tx, actor, s, receivedAt));
}

function receivedAtFor(day: string | undefined, time: string | null | undefined, now = new Date()) {
  if (!day || (day === todayISO(now) && !time)) return now;
  if (day > todayISO(now)) throw invalid("The hand-in date cannot be in the future.", { receivedOn: "Cannot be in the future." });
  const at = time ? zonedDateTime(day, time) : new Date(startOfDayInTz(day).getTime() + 12 * 3600_000);
  if (at > now) throw invalid("The hand-in time cannot be in the future.", { receivedTime: "Cannot be in the future." });
  return at;
}

async function receiptTx(tx: Tx, actor: Actor, s: Loaded, receivedAt: Date) {
  // Numbering includes undone hand-ins so numbers are never reused.
  const max = await tx.statementVersion.aggregate({ where: { statementId: s.id }, _max: { versionNumber: true } });
  const versionNumber = (max._max.versionNumber ?? 0) + 1;
  const late = receivedAt > s.dueAt;
  await moveStatus(tx, s, "PENDING_REVIEW", actor.id, { lastReceivedAt: receivedAt });
  const version = await tx.statementVersion.create({
    data: { statementId: s.id, versionNumber, receivedAt, dueAt: s.dueAt, recordedById: actor.id },
  });
  await writeAudit(tx, {
    actorId: actor.id,
    action: versionNumber > 1 ? "statement.resubmitted" : "statement.received",
    entityType: "Statement",
    entityId: s.id,
    batchId: s.batchId,
    cadetId: s.cadetId,
    summary: `${versionNumber > 1 ? `Rewrite (submission ${versionNumber})` : "Statement"} handed in by ${s.cadet.name}${late ? " — late" : ""}`,
    changes: { status: { from: s.status, to: "PENDING_REVIEW" }, version: versionNumber, late },
  });
  return version;
}

const reviewSchema = z.object({
  statementId: id,
  outcome: z.enum(["ACCEPTED", "REWRITE_REQUIRED"]),
  feedback: optionalText(2000),
  newDueDate: isoDate.optional().nullable(),
  newDueTime: hhmm,
  expectedVersion: z.number().int().positive().optional(),
});

/** Review the latest submission of a statement that is pending review. */
export async function reviewStatement(actor: Actor, input: z.input<typeof reviewSchema>) {
  const data = parse(reviewSchema, input);
  const s = await loadForWrite(data.statementId);
  if (s.status !== "PENDING_REVIEW") {
    throw conflict(`Only statements pending review can be reviewed (this one is "${statementStatusLabel[s.status]}").`);
  }
  const latest = s.versions[0];
  if (!latest) throw conflict("No hand-in has been recorded for this statement.");
  if (data.expectedVersion && latest.versionNumber !== data.expectedVersion) {
    throw conflict("A newer submission was recorded. Reload and review the latest one.");
  }
  const newDueAt = data.outcome === "REWRITE_REQUIRED" ? deadlineFrom(data.newDueDate, data.newDueTime) : null;
  return prisma.$transaction((tx) => reviewTx(tx, actor, s, latest.id, latest.versionNumber, data.outcome, data.feedback, newDueAt));
}

async function reviewTx(
  tx: Tx,
  actor: Actor,
  s: Loaded,
  versionId: string,
  versionNumber: number,
  outcome: "ACCEPTED" | "REWRITE_REQUIRED",
  feedback: string | null | undefined,
  newDueAt: Date | null,
) {
  const now = new Date();
  await moveStatus(tx, s, outcome, actor.id, {
    acceptedAt: outcome === "ACCEPTED" ? now : null,
    ...(newDueAt ? { dueAt: newDueAt } : {}),
  });
  const review = await tx.statementReview.create({
    data: { statementId: s.id, versionId, outcome, feedback: feedback ?? null, newDueAt, reviewedById: actor.id, reviewedAt: now },
  });
  await writeAudit(tx, {
    actorId: actor.id,
    action: outcome === "ACCEPTED" ? "statement.accepted" : "statement.rewrite_requested",
    entityType: "Statement",
    entityId: s.id,
    batchId: s.batchId,
    cadetId: s.cadetId,
    summary:
      outcome === "ACCEPTED"
        ? `Accepted ${s.cadet.name}'s statement (submission ${versionNumber})`
        : `Rewrite required from ${s.cadet.name} by ${formatDeadline(newDueAt!)}`,
    changes: {
      status: { from: s.status, to: outcome },
      version: versionNumber,
      ...(newDueAt ? { dueAt: { from: s.dueAt.toISOString(), to: newDueAt.toISOString() } } : {}),
    },
  });
  return review;
}

const reopenSchema = z.object({
  statementId: id,
  to: z.enum(["PENDING_REVIEW", "REWRITE_REQUIRED"]),
  reason,
  feedback: optionalText(2000),
  newDueDate: isoDate.optional().nullable(),
  newDueTime: hhmm,
});

/** Reopen an accepted statement. Requires a recorded reason. */
export async function reopenStatement(actor: Actor, input: z.input<typeof reopenSchema>) {
  const data = parse(reopenSchema, input);
  const s = await loadForWrite(data.statementId);
  if (s.status !== "ACCEPTED") throw conflict("Only accepted statements can be reopened.");
  const newDueAt = data.to === "REWRITE_REQUIRED" ? deadlineFrom(data.newDueDate, data.newDueTime) : null;
  const latest = s.versions[0];
  return prisma.$transaction(async (tx) => {
    await moveStatus(tx, s, data.to, actor.id, { acceptedAt: null, ...(newDueAt ? { dueAt: newDueAt } : {}) });
    if (data.to === "REWRITE_REQUIRED") {
      await tx.statementReview.create({
        data: {
          statementId: s.id,
          versionId: latest?.id ?? null,
          outcome: "REWRITE_REQUIRED",
          feedback: data.feedback ?? null,
          newDueAt,
          reviewedById: actor.id,
        },
      });
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: "statement.reopened",
      entityType: "Statement",
      entityId: s.id,
      batchId: s.batchId,
      cadetId: s.cadetId,
      summary: `Reopened ${s.cadet.name}'s accepted statement (now ${statementStatusLabel[data.to]})`,
      changes: {
        status: { from: "ACCEPTED", to: data.to },
        ...(newDueAt ? { dueAt: { from: s.dueAt.toISOString(), to: newDueAt.toISOString() } } : {}),
      },
      reason: data.reason,
    });
  });
}

const detailsSchema = z.object({
  statementId: id,
  title: requiredText(500, "Enter the subject."),
  notes: optionalText(4000),
  issuedOn: isoDate,
  dueDate: isoDate,
  dueTime: hhmm,
  reason,
});

/** Correct the subject, notes, issue date or deadline (e.g. grant an extension). */
export async function updateStatementDetails(actor: Actor, input: z.input<typeof detailsSchema>) {
  const data = parse(detailsSchema, input);
  if (data.dueDate < data.issuedOn) throw invalid("The deadline cannot be before the issue date.", { dueDate: "Before the issue date." });
  const s = await loadForWrite(data.statementId);
  const dueAt = zonedDateTime(data.dueDate, data.dueTime || "23:59");
  const fmt = (d: Date) => `${toISODateInTz(d)} ${toTimeInTz(d)}`;
  const before = { title: s.title, notes: s.notes, issuedOn: dateOnlyISO(s.issuedOn), deadline: fmt(s.dueAt) };
  const after = { title: data.title, notes: data.notes, issuedOn: data.issuedOn, deadline: fmt(dueAt) };
  const changes = diff(before, after, ["title", "notes", "issuedOn", "deadline"]);
  if (!Object.keys(changes).length) return;
  await prisma.$transaction(async (tx) => {
    await tx.statement.update({
      where: { id: s.id },
      data: { title: data.title, notes: data.notes, issuedOn: parseISODate(data.issuedOn), dueAt, updatedById: actor.id },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "statement.corrected",
      entityType: "Statement",
      entityId: s.id,
      batchId: s.batchId,
      cadetId: s.cadetId,
      summary: changes.deadline && Object.keys(changes).length === 1
        ? `Changed ${s.cadet.name}'s statement deadline to ${formatDeadline(dueAt)}`
        : `Corrected statement details for ${s.cadet.name}`,
      changes,
      reason: data.reason,
    });
  });
}

export async function voidStatement(actor: Actor, input: { statementId: string; reason: string }) {
  const data = parse(z.object({ statementId: id, reason }), input);
  const s = await loadForWrite(data.statementId);
  await prisma.$transaction(async (tx) => {
    const res = await tx.statement.updateMany({
      where: { id: s.id, voided: false },
      data: { voided: true, voidReason: data.reason, voidedAt: new Date(), voidedById: actor.id, updatedById: actor.id },
    });
    if (res.count !== 1) throw conflict("This statement was updated elsewhere. Reload and try again.");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "statement.voided",
      entityType: "Statement",
      entityId: s.id,
      batchId: s.batchId,
      cadetId: s.cadetId,
      summary: `Voided statement for ${s.cadet.name}`,
      changes: { voided: { from: false, to: true }, status: s.status },
      reason: data.reason,
    });
  });
}

const bulkSchema = z.object({
  batchId: id,
  statementIds: z.array(id).min(1).max(500),
  action: z.enum(["RECEIVE", "ACCEPT", "REWRITE"]),
  confirmCount: z.number().int(),
  feedback: optionalText(2000),
  newDueDate: isoDate.optional().nullable(),
  newDueTime: hhmm,
});

/**
 * Bulk status change. All-or-nothing: if any selected statement is not in a
 * valid state for the action, nothing is changed.
 */
export async function bulkStatementAction(actor: Actor, input: z.input<typeof bulkSchema>) {
  const data = parse(bulkSchema, input);
  const ids = [...new Set(data.statementIds)];
  if (data.confirmCount !== ids.length) throw invalid("Confirmation count does not match the selection.");
  const newDueAt = data.action === "REWRITE" ? deadlineFrom(data.newDueDate, data.newDueTime) : null;
  const rows = await prisma.statement.findMany({
    where: { id: { in: ids }, batchId: data.batchId },
    include: { batch: true, cadet: true, versions: { where: { retractedAt: null }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (rows.length !== ids.length) throw invalid("Some selected statements are not in this batch.");
  if (rows.some((r) => r.batch.status !== "OPEN")) throw readOnly();
  const allowed: StatementStatus[] = data.action === "RECEIVE" ? ["NOT_SUBMITTED", "REWRITE_REQUIRED"] : ["PENDING_REVIEW"];
  const bad = rows.filter((r) => r.voided || !allowed.includes(r.status));
  if (bad.length) {
    const verb = data.action === "RECEIVE" ? "record hand-in for" : data.action === "ACCEPT" ? "accept" : "require a rewrite for";
    throw conflict(
      `Cannot ${verb}: ${bad.map((r) => `${r.cadet.name} (${r.voided ? "voided" : statementStatusLabel[r.status]})`).join(", ")}. Nothing was changed.`,
    );
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const s of rows) {
      if (data.action === "RECEIVE") await receiptTx(tx, actor, s, now);
      else {
        const latest = s.versions[0]!;
        await reviewTx(tx, actor, s, latest.id, latest.versionNumber, data.action === "ACCEPT" ? "ACCEPTED" : "REWRITE_REQUIRED", data.feedback, newDueAt);
      }
    }
    const label = { RECEIVE: "Recorded hand-in of", ACCEPT: "Accepted", REWRITE: "Required rewrites for" }[data.action];
    await writeAudit(tx, {
      actorId: actor.id,
      action: `statement.bulk_${data.action.toLowerCase()}`,
      entityType: "Statement",
      batchId: data.batchId,
      summary: `${label} ${rows.length} statements in one action`,
      changes: { ids, count: rows.length },
    });
  });
  return rows.length;
}


export type UndoRef = { type: "version" | "review"; id: string };
export const UNDO_WINDOW_MS = 2 * 60_000;

/**
 * Undo a hand-in or review the same instructor recorded moments ago (e.g. a
 * mis-tap). Nothing is deleted: the entry is marked retracted, the previous
 * status (and deadline) is restored, and the undo is audited.
 */
export async function undoStatementChange(actor: Actor, input: { statementId: string; ref: UndoRef }) {
  const data = parse(
    z.object({ statementId: id, ref: z.object({ type: z.enum(["version", "review"]), id }) }),
    input,
  );
  const s = await loadForWrite(data.statementId);
  const now = new Date();
  const tooLate = (at: Date) => now.getTime() - at.getTime() > UNDO_WINDOW_MS;

  if (data.ref.type === "version") {
    const versions = await prisma.statementVersion.findMany({
      where: { statementId: s.id, retractedAt: null },
      orderBy: { versionNumber: "desc" },
      include: { reviews: { where: { retractedAt: null } } },
    });
    const v = versions[0];
    if (!v || v.id !== data.ref.id) throw conflict("Only the most recent hand-in can be undone.");
    if (v.recordedById !== actor.id) throw conflict("Only the instructor who recorded this hand-in can undo it.");
    if (tooLate(v.createdAt)) throw conflict("Undo is only available for 2 minutes. Ask a colleague or void instead.");
    if (s.status !== "PENDING_REVIEW" || v.reviews.length) throw conflict("This statement has changed since — it can no longer be undone.");
    const previous = versions[1];
    const restore: StatementStatus = previous ? "REWRITE_REQUIRED" : "NOT_SUBMITTED";
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, s, restore, actor.id, { lastReceivedAt: previous?.receivedAt ?? null });
      await tx.statementVersion.update({ where: { id: v.id }, data: { retractedAt: now, retractedById: actor.id } });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "statement.undone",
        entityType: "Statement",
        entityId: s.id,
        batchId: s.batchId,
        cadetId: s.cadetId,
        summary: `Undid hand-in for ${s.cadet.name} (back to ${statementStatusLabel[restore]})`,
        changes: { status: { from: s.status, to: restore }, undone: "hand-in", version: v.versionNumber },
        reason: "Undone immediately after recording",
      });
    });
    return restore;
  }

  const r = await prisma.statementReview.findFirst({
    where: { statementId: s.id, retractedAt: null },
    orderBy: { reviewedAt: "desc" },
    include: { version: true },
  });
  if (!r || r.id !== data.ref.id) throw conflict("Only the most recent review can be undone.");
  if (r.reviewedById !== actor.id) throw conflict("Only the instructor who made this decision can undo it.");
  if (tooLate(r.reviewedAt)) throw conflict("Undo is only available for 2 minutes. Use Reopen instead.");
  if (s.status !== r.outcome) throw conflict("This statement has changed since — it can no longer be undone.");
  const restoreDue = r.outcome === "REWRITE_REQUIRED" ? (r.version?.dueAt ?? s.dueAt) : s.dueAt;
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, s, "PENDING_REVIEW", actor.id, { acceptedAt: null, dueAt: restoreDue });
    await tx.statementReview.update({ where: { id: r.id }, data: { retractedAt: now, retractedById: actor.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "statement.undone",
      entityType: "Statement",
      entityId: s.id,
      batchId: s.batchId,
      cadetId: s.cadetId,
      summary: `Undid "${statementStatusLabel[r.outcome]}" for ${s.cadet.name} (back to Pending review)`,
      changes: {
        status: { from: s.status, to: "PENDING_REVIEW" },
        undone: r.outcome,
        ...(restoreDue.getTime() !== s.dueAt.getTime() ? { dueAt: { from: s.dueAt.toISOString(), to: restoreDue.toISOString() } } : {}),
      },
      reason: "Undone immediately after recording",
    });
  });
  return "PENDING_REVIEW" as const;
}
