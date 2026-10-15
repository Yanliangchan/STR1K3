/**
 * Statement workflow. Statuses and allowed transitions:
 *   NOT_SUBMITTED    -> PENDING_REVIEW   (receipt recorded; creates version 1)
 *   PENDING_REVIEW   -> ACCEPTED | REWRITE_REQUIRED (review of latest version)
 *   REWRITE_REQUIRED -> PENDING_REVIEW   (rewrite received; creates a new version)
 *   ACCEPTED         -> PENDING_REVIEW | REWRITE_REQUIRED only via explicit reopen with a reason
 * Versions and reviews are append-only; nothing is overwritten.
 */
import { z } from "zod";
import type { Prisma, StatementStatus } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { diff, writeAudit } from "@/server/audit";
import { conflict, invalid, notFound, readOnly } from "@/server/errors";
import { id, isoDate, optionalText, parse, reason, requiredText } from "@/server/validation";
import { parseISODate, startOfDayInTz, todayISO } from "@/lib/dates";
import { statementStatusLabel, STATEMENT_STATUSES } from "@/lib/labels";

export type StatementListQuery = {
  status?: StatementStatus | "OUTSTANDING";
  byteId?: string;
  cadetId?: string;
  from?: string;
  to?: string;
  q?: string;
  includeVoided?: boolean;
  occurrenceId?: string;
};

export function statementWhere(batchId: string, f: StatementListQuery): Prisma.StatementWhereInput {
  return {
    batchId,
    ...(f.includeVoided ? {} : { voided: false }),
    ...(f.status === "OUTSTANDING"
      ? { status: { in: ["NOT_SUBMITTED", "PENDING_REVIEW", "REWRITE_REQUIRED"] } }
      : f.status
        ? { status: f.status }
        : {}),
    ...(f.cadetId ? { cadetId: f.cadetId } : {}),
    ...(f.byteId ? { cadet: { byteId: f.byteId } } : {}),
    ...(f.occurrenceId ? { occurrenceId: f.occurrenceId } : {}),
    ...(f.from || f.to
      ? {
          requestedOn: {
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
  PENDING_REVIEW: 0,
  REWRITE_REQUIRED: 1,
  NOT_SUBMITTED: 2,
  ACCEPTED: 3,
};

export async function listStatements(batchId: string, f: StatementListQuery = {}, take = 300) {
  const where = statementWhere(batchId, f);
  const [rows, total] = await Promise.all([
    prisma.statement.findMany({
      where,
      include: {
        cadet: { include: { byte: true } },
        _count: { select: { versions: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take,
    }),
    prisma.statement.count({ where }),
  ]);
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.getTime() - a.updatedAt.getTime());
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

async function loadForWrite(statementId: string, expectedStatus?: StatementStatus) {
  const s = await prisma.statement.findUnique({
    where: { id: statementId },
    include: { batch: true, cadet: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
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

const receiptSchema = z.object({
  statementId: id,
  content: optionalText(50000),
  receivedOn: isoDate.optional(),
  expectedStatus: z.enum(STATEMENT_STATUSES as [StatementStatus, ...StatementStatus[]]).optional(),
});

/** Record that a statement (or a rewrite) has been received. Always lands in PENDING_REVIEW. */
export async function recordReceipt(actor: Actor, input: z.input<typeof receiptSchema>) {
  const data = parse(receiptSchema, input);
  const s = await loadForWrite(data.statementId, data.expectedStatus);
  if (s.status !== "NOT_SUBMITTED" && s.status !== "REWRITE_REQUIRED") {
    throw conflict(`A submission cannot be recorded while the statement is "${statementStatusLabel[s.status]}".`);
  }
  return prisma.$transaction((tx) => receiptTx(tx, actor, s, data.content, data.receivedOn));
}

async function receiptTx(
  tx: Tx,
  actor: Actor,
  s: { id: string; status: StatementStatus; batchId: string; cadetId: string; cadet: { name: string }; versions: { versionNumber: number }[] },
  content: string | null | undefined,
  receivedOn?: string,
) {
  const now = new Date();
  const receivedAt = receivedOn ? receivedAtFor(receivedOn, now) : now;
  const versionNumber = (s.versions[0]?.versionNumber ?? 0) + 1;
  await moveStatus(tx, s, "PENDING_REVIEW", actor.id, { lastReceivedAt: receivedAt });
  const version = await tx.statementVersion.create({
    data: { statementId: s.id, versionNumber, content: content ?? null, receivedAt, recordedById: actor.id },
  });
  await writeAudit(tx, {
    actorId: actor.id,
    action: versionNumber > 1 ? "statement.resubmitted" : "statement.received",
    entityType: "Statement",
    entityId: s.id,
    batchId: s.batchId,
    cadetId: s.cadetId,
    summary:
      versionNumber > 1
        ? `Rewritten statement (version ${versionNumber}) received from ${s.cadet.name}`
        : `Statement received from ${s.cadet.name}`,
    changes: { status: { from: s.status, to: "PENDING_REVIEW" }, version: versionNumber },
  });
  return version;
}

function receivedAtFor(iso: string, now: Date) {
  // If the receipt date is today, keep the exact time; otherwise use midday of that date.
  if (iso === todayISO(now)) return now;
  if (iso > todayISO(now)) throw invalid("The received date cannot be in the future.", { receivedOn: "Cannot be in the future." });
  return new Date(startOfDayInTz(iso).getTime() + 12 * 3600 * 1000);
}

const reviewSchema = z
  .object({
    statementId: id,
    outcome: z.enum(["ACCEPTED", "REWRITE_REQUIRED"]),
    feedback: optionalText(10000),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === "REWRITE_REQUIRED" && !v.feedback) {
      ctx.addIssue({ code: "custom", path: ["feedback"], message: "Explain what needs to be corrected." });
    }
  });

/** Review the latest version of a statement that is pending review. */
export async function reviewStatement(actor: Actor, input: z.input<typeof reviewSchema>) {
  const data = parse(reviewSchema, input);
  const s = await loadForWrite(data.statementId);
  if (s.status !== "PENDING_REVIEW") {
    throw conflict(`Only statements pending review can be reviewed (this one is "${statementStatusLabel[s.status]}").`);
  }
  const latest = s.versions[0];
  if (!latest) throw conflict("No submission has been recorded for this statement.");
  if (data.expectedVersion && latest.versionNumber !== data.expectedVersion) {
    throw conflict("A newer version was recorded. Reload and review the latest version.");
  }
  return prisma.$transaction((tx) => reviewTx(tx, actor, s, latest.id, latest.versionNumber, data.outcome, data.feedback));
}

async function reviewTx(
  tx: Tx,
  actor: Actor,
  s: { id: string; status: StatementStatus; batchId: string; cadetId: string; cadet: { name: string } },
  versionId: string,
  versionNumber: number,
  outcome: "ACCEPTED" | "REWRITE_REQUIRED",
  feedback: string | null | undefined,
) {
  const now = new Date();
  await moveStatus(tx, s, outcome, actor.id, { acceptedAt: outcome === "ACCEPTED" ? now : null });
  const review = await tx.statementReview.create({
    data: { statementId: s.id, versionId, outcome, feedback: feedback ?? null, reviewedById: actor.id, reviewedAt: now },
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
        ? `Accepted statement (version ${versionNumber}) from ${s.cadet.name}`
        : `Rewrite requested for ${s.cadet.name}'s statement (version ${versionNumber})`,
    changes: { status: { from: s.status, to: outcome }, version: versionNumber },
  });
  return review;
}

const reopenSchema = z
  .object({
    statementId: id,
    to: z.enum(["PENDING_REVIEW", "REWRITE_REQUIRED"]),
    reason,
    feedback: optionalText(10000),
  })
  .superRefine((v, ctx) => {
    if (v.to === "REWRITE_REQUIRED" && !v.feedback) {
      ctx.addIssue({ code: "custom", path: ["feedback"], message: "Explain what needs to be corrected." });
    }
  });

/** Reopen an accepted statement. Requires a recorded reason. */
export async function reopenStatement(actor: Actor, input: z.input<typeof reopenSchema>) {
  const data = parse(reopenSchema, input);
  const s = await loadForWrite(data.statementId);
  if (s.status !== "ACCEPTED") throw conflict("Only accepted statements can be reopened.");
  const latest = s.versions[0];
  return prisma.$transaction(async (tx) => {
    await moveStatus(tx, s, data.to, actor.id, { acceptedAt: null });
    if (data.to === "REWRITE_REQUIRED") {
      await tx.statementReview.create({
        data: {
          statementId: s.id,
          versionId: latest?.id ?? null,
          outcome: "REWRITE_REQUIRED",
          feedback: data.feedback ?? null,
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
      changes: { status: { from: "ACCEPTED", to: data.to } },
      reason: data.reason,
    });
  });
}

const detailsSchema = z.object({
  statementId: id,
  title: requiredText(4000, "Enter the statement description."),
  instructions: optionalText(4000),
  notes: optionalText(4000),
  requestedOn: isoDate,
  reason,
});

export async function updateStatementDetails(actor: Actor, input: z.input<typeof detailsSchema>) {
  const data = parse(detailsSchema, input);
  const s = await loadForWrite(data.statementId);
  const before = { title: s.title, instructions: s.instructions, notes: s.notes, requestedOn: s.requestedOn.toISOString().slice(0, 10) };
  const after = { title: data.title, instructions: data.instructions, notes: data.notes, requestedOn: data.requestedOn };
  const changes = diff(before, after, ["title", "instructions", "notes", "requestedOn"]);
  if (!Object.keys(changes).length) return;
  await prisma.$transaction(async (tx) => {
    await tx.statement.update({
      where: { id: s.id },
      data: { title: data.title, instructions: data.instructions, notes: data.notes, requestedOn: parseISODate(data.requestedOn), updatedById: actor.id },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "statement.corrected",
      entityType: "Statement",
      entityId: s.id,
      batchId: s.batchId,
      cadetId: s.cadetId,
      summary: `Corrected statement request details for ${s.cadet.name}`,
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
      summary: `Voided statement request for ${s.cadet.name}`,
      changes: { voided: { from: false, to: true }, status: s.status },
      reason: data.reason,
    });
  });
}

const bulkSchema = z.object({
  batchId: id,
  statementIds: z.array(id).min(1).max(500),
  action: z.enum(["RECEIVE", "ACCEPT"]),
  confirmCount: z.number().int(),
  feedback: optionalText(10000),
});

/**
 * Bulk status change. All-or-nothing: if any selected statement is not in a
 * valid state for the action, nothing is changed.
 */
export async function bulkStatementAction(actor: Actor, input: z.input<typeof bulkSchema>) {
  const data = parse(bulkSchema, input);
  const ids = [...new Set(data.statementIds)];
  if (data.confirmCount !== ids.length) throw invalid("Confirmation count does not match the selection.");
  const rows = await prisma.statement.findMany({
    where: { id: { in: ids }, batchId: data.batchId },
    include: { batch: true, cadet: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (rows.length !== ids.length) throw invalid("Some selected statements are not in this batch.");
  if (rows.some((r) => r.batch.status !== "OPEN")) throw readOnly();
  const allowed: StatementStatus[] = data.action === "RECEIVE" ? ["NOT_SUBMITTED", "REWRITE_REQUIRED"] : ["PENDING_REVIEW"];
  const bad = rows.filter((r) => r.voided || !allowed.includes(r.status));
  if (bad.length) {
    throw conflict(
      `Cannot ${data.action === "RECEIVE" ? "record receipt for" : "accept"}: ${bad
        .map((r) => `${r.cadet.name} (${r.voided ? "voided" : statementStatusLabel[r.status]})`)
        .join(", ")}. Nothing was changed.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    for (const s of rows) {
      if (data.action === "RECEIVE") await receiptTx(tx, actor, s, null);
      else {
        const latest = s.versions[0]!;
        await reviewTx(tx, actor, s, latest.id, latest.versionNumber, "ACCEPTED", data.feedback);
      }
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: data.action === "RECEIVE" ? "statement.bulk_received" : "statement.bulk_accepted",
      entityType: "Statement",
      batchId: data.batchId,
      summary: `${data.action === "RECEIVE" ? "Recorded receipt of" : "Accepted"} ${rows.length} statements in one action`,
      changes: { ids, count: rows.length },
    });
  });
  return rows.length;
}
