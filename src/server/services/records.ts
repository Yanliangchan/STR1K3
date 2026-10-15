import { z } from "zod";
import type { Prisma, RecordType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { diff, writeAudit } from "@/server/audit";
import { conflict, invalid, notFound, readOnly } from "@/server/errors";
import { id, isoDate, optionalText, parse, reason, requiredText } from "@/server/validation";
import { dateOnlyISO, parseISODate } from "@/lib/dates";

export type RecordListQuery = {
  type?: RecordType;
  cadetId?: string;
  byteId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
  includeVoided?: boolean;
  occurrenceId?: string;
};

export function recordWhere(batchId: string, f: RecordListQuery): Prisma.RecordWhereInput {
  return {
    batchId,
    ...(f.includeVoided ? {} : { status: "ACTIVE" }),
    ...(f.type ? { type: f.type } : {}),
    ...(f.cadetId ? { cadetId: f.cadetId } : {}),
    ...(f.byteId ? { cadet: { byteId: f.byteId } } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId === "none" ? null : f.categoryId } : {}),
    ...(f.occurrenceId ? { occurrenceId: f.occurrenceId } : {}),
    ...(f.from || f.to
      ? {
          occurredOn: {
            ...(f.from ? { gte: parseISODate(f.from) } : {}),
            ...(f.to ? { lte: parseISODate(f.to) } : {}),
          },
        }
      : {}),
    ...(f.q
      ? {
          OR: [
            { description: { contains: f.q, mode: "insensitive" } },
            { notes: { contains: f.q, mode: "insensitive" } },
            { referenceNo: { contains: f.q, mode: "insensitive" } },
            { cadet: { name: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listRecords(batchId: string, f: RecordListQuery = {}, take = 200) {
  const where = recordWhere(batchId, f);
  const [rows, total] = await Promise.all([
    prisma.record.findMany({
      where,
      include: { cadet: { include: { byte: true } }, category: true, createdBy: { select: { name: true } } },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take,
    }),
    prisma.record.count({ where }),
  ]);
  return { rows, total };
}

export async function getRecord(recordId: string, batchId?: string) {
  const r = await prisma.record.findUnique({
    where: { id: recordId },
    include: {
      cadet: { include: { byte: true } },
      batch: true,
      category: true,
      occurrence: true,
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
  if (!r || (batchId && r.batchId !== batchId)) throw notFound("Record");
  return r;
}

const correctionSchema = z.object({
  recordId: id,
  date: isoDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  categoryId: z.string().max(64).optional().nullable().transform((v) => v || null),
  description: requiredText(4000, "Enter a description."),
  notes: optionalText(4000),
  referenceNo: optionalText(100),
  reason,
  expectedUpdatedAt: z.string().optional(),
});

/** Correct a NOR/CROW. The previous values are preserved in the audit log. */
export async function correctRecord(actor: Actor, input: z.input<typeof correctionSchema>) {
  const data = parse(correctionSchema, input);
  const rec = await getRecord(data.recordId);
  if (rec.batch.status !== "OPEN") throw readOnly();
  if (rec.status === "VOIDED") throw conflict("A voided record cannot be edited.");
  if (data.expectedUpdatedAt && rec.updatedAt.toISOString() !== data.expectedUpdatedAt) {
    throw conflict("This record was changed by someone else. Reload and try again.");
  }
  let newCategoryName: string | null = null;
  if (data.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: data.categoryId, recordType: rec.type } });
    if (!cat) throw invalid("Select a valid category.", { categoryId: "Select a valid category." });
    newCategoryName = cat.name;
  }
  const before = {
    date: dateOnlyISO(rec.occurredOn),
    time: rec.occurredTime,
    category: rec.category?.name ?? null,
    description: rec.description,
    notes: rec.notes,
    referenceNo: rec.referenceNo,
  };
  const after = {
    date: data.date,
    time: data.time ?? null,
    category: newCategoryName,
    description: data.description,
    notes: data.notes,
    referenceNo: data.referenceNo,
  };
  const changes = diff(before, after, ["date", "time", "category", "description", "notes", "referenceNo"]);
  if (Object.keys(changes).length === 0) return rec;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.record.update({
      where: { id: rec.id, updatedAt: rec.updatedAt },
      data: {
        occurredOn: parseISODate(data.date),
        occurredTime: data.time ?? null,
        categoryId: data.categoryId,
        description: data.description,
        notes: data.notes,
        referenceNo: data.referenceNo,
        updatedById: actor.id,
      },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "record.corrected",
      entityType: "Record",
      entityId: rec.id,
      batchId: rec.batchId,
      cadetId: rec.cadetId,
      summary: `Corrected ${rec.type} for ${rec.cadet.name}`,
      changes,
      reason: data.reason,
    });
    return updated;
  });
}

/** Void a record: it is retained, marked voided, and excluded from counts. */
export async function voidRecord(actor: Actor, input: { recordId: string; reason: string }) {
  const data = parse(z.object({ recordId: id, reason }), input);
  const rec = await getRecord(data.recordId);
  if (rec.batch.status !== "OPEN") throw readOnly();
  if (rec.status === "VOIDED") throw conflict("This record is already voided.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.record.update({
      where: { id: rec.id, status: "ACTIVE" },
      data: { status: "VOIDED", voidReason: data.reason, voidedAt: new Date(), voidedById: actor.id, updatedById: actor.id },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "record.voided",
      entityType: "Record",
      entityId: rec.id,
      batchId: rec.batchId,
      cadetId: rec.cadetId,
      summary: `Voided ${rec.type} for ${rec.cadet.name}`,
      changes: { status: { from: "ACTIVE", to: "VOIDED" } },
      reason: data.reason,
    });
    return updated;
  });
}

export async function listOccurrences(batchId: string, take = 30) {
  return prisma.occurrence.findMany({
    where: { batchId },
    orderBy: { createdAt: "desc" },
    take,
    include: { _count: { select: { records: true, statements: true } } },
  });
}
