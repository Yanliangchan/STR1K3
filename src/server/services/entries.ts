/**
 * Creating NOR / CROW records and statement requests — individually or in bulk.
 * Every selected cadet always receives their own, independent row.
 */
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit, writeAuditMany, type AuditInput } from "@/server/audit";
import { invalid, readOnly, translateDbError } from "@/server/errors";
import { id, isoDate, optionalText, parse, requiredText } from "@/server/validation";
import { parseISODate } from "@/lib/dates";
import { recordTypeLabel } from "@/lib/labels";
import { truncate } from "@/lib/utils";

export const ENTRY_KINDS = ["NOR", "CROW", "STATEMENT"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

const overrideSchema = z.object({
  description: optionalText(4000),
  notes: optionalText(4000),
  instructions: optionalText(4000),
});

export const createEntriesSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(100),
    batchId: id,
    kind: z.enum(ENTRY_KINDS),
    cadetIds: z.array(id).min(1, "Select at least one cadet.").max(500),
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
    instructions: optionalText(4000),
    occurrence: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("none") }),
        z.object({ mode: z.literal("new"), title: optionalText(200) }),
        z.object({ mode: z.literal("existing"), occurrenceId: id }),
      ])
      .default({ mode: "none" }),
    overrides: z.record(id, overrideSchema).default({}),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.cadetIds).size !== v.cadetIds.length) {
      ctx.addIssue({ code: "custom", path: ["cadetIds"], message: "A cadet was selected twice." });
    }
    for (const cid of Object.keys(v.overrides)) {
      if (!v.cadetIds.includes(cid)) {
        ctx.addIssue({ code: "custom", path: ["overrides"], message: "Override for a cadet who is not selected." });
      }
    }
  });

export type CreateEntriesInput = z.input<typeof createEntriesSchema>;

export type CreateEntriesResult = {
  bulkOperationId: string;
  kind: EntryKind;
  created: { id: string; cadetId: string; cadetName: string }[];
  occurrenceId: string | null;
  /** True when this exact request was already processed (e.g. a retry). */
  replayed: boolean;
};

export async function createEntries(actor: Actor, input: CreateEntriesInput): Promise<CreateEntriesResult> {
  const data = parse(createEntriesSchema, input);

  // A retry with the same key returns the original result instead of duplicating.
  const prior = await findBulkResult(data.idempotencyKey, actor.id);
  if (prior) return prior;

  const batch = await prisma.batch.findUnique({ where: { id: data.batchId } });
  if (!batch) throw invalid("Batch not found.");
  if (batch.status !== "OPEN") throw readOnly();

  const cadets = await prisma.cadet.findMany({
    where: { id: { in: data.cadetIds }, batchId: batch.id },
    include: { byte: true },
  });
  const byId = new Map(cadets.map((c) => [c.id, c]));
  const missing = data.cadetIds.filter((cid) => !byId.has(cid));
  if (missing.length) throw invalid("Some selected cadets are not in this batch.", { cadetIds: "Invalid selection." });
  const inactive = cadets.filter((c) => c.status !== "ACTIVE");
  if (inactive.length) {
    throw invalid(`${inactive.map((c) => c.name).join(", ")} ${inactive.length === 1 ? "is" : "are"} no longer on the active roster.`, {
      cadetIds: "Remove inactive cadets.",
    });
  }

  if (data.kind !== "STATEMENT" && data.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: data.categoryId, recordType: data.kind, active: true } });
    if (!cat) throw invalid("Select a valid category.", { categoryId: "Select a valid category." });
  }
  if (data.occurrence.mode === "existing") {
    const occ = await prisma.occurrence.findFirst({ where: { id: data.occurrence.occurrenceId, batchId: batch.id } });
    if (!occ) throw invalid("Select an occurrence from this batch.", { occurrence: "Invalid occurrence." });
  }

  const date = parseISODate(data.date);
  const label = recordTypeLabel[data.kind];

  try {
    return await prisma.$transaction(async (tx) => {
      const op = await tx.bulkOperation.create({
        data: {
          idempotencyKey: data.idempotencyKey,
          batchId: batch.id,
          kind: data.kind,
          count: data.cadetIds.length,
          createdById: actor.id,
        },
      });

      let occurrenceId: string | null = null;
      if (data.occurrence.mode === "existing") occurrenceId = data.occurrence.occurrenceId;
      if (data.occurrence.mode === "new") {
        const occ = await tx.occurrence.create({
          data: {
            batchId: batch.id,
            title: data.occurrence.title ?? truncate(data.description, 80),
            occurredOn: date,
            createdById: actor.id,
          },
        });
        occurrenceId = occ.id;
      }

      const isBulk = data.cadetIds.length > 1;
      const audits: AuditInput[] = [];
      let created: { id: string; cadetId: string }[];

      if (data.kind === "STATEMENT") {
        created = await tx.statement.createManyAndReturn({
          select: { id: true, cadetId: true },
          data: data.cadetIds.map((cadetId) => {
            const o = data.overrides[cadetId];
            return {
              batchId: batch.id,
              cadetId,
              title: o?.description ?? data.description,
              instructions: o?.instructions ?? data.instructions,
              notes: o?.notes ?? data.notes,
              requestedOn: date,
              occurrenceId,
              bulkOperationId: op.id,
              createdById: actor.id,
            };
          }),
        });
      } else {
        created = await tx.record.createManyAndReturn({
          select: { id: true, cadetId: true },
          data: data.cadetIds.map((cadetId) => {
            const o = data.overrides[cadetId];
            return {
              batchId: batch.id,
              cadetId,
              type: data.kind as "NOR" | "CROW",
              categoryId: data.categoryId,
              description: o?.description ?? data.description,
              notes: o?.notes ?? data.notes,
              referenceNo: data.referenceNo,
              occurredOn: date,
              occurredTime: data.time ?? null,
              occurrenceId,
              bulkOperationId: op.id,
              createdById: actor.id,
            };
          }),
        });
      }

      if (created.length !== data.cadetIds.length) throw new Error("Bulk creation count mismatch");

      for (const row of created) {
        const cadet = byId.get(row.cadetId)!;
        audits.push({
          actorId: actor.id,
          action: data.kind === "STATEMENT" ? "statement.created" : "record.created",
          entityType: data.kind === "STATEMENT" ? "Statement" : "Record",
          entityId: row.id,
          batchId: batch.id,
          cadetId: row.cadetId,
          summary:
            data.kind === "STATEMENT"
              ? `Statement requested from ${cadet.name}`
              : `${label} recorded for ${cadet.name}`,
          changes: { bulk: isBulk, bulkOperationId: op.id, ...(data.kind === "STATEMENT" ? { status: { from: null, to: "NOT_SUBMITTED" } } : {}) },
        });
      }
      await writeAuditMany(tx, audits);
      if (isBulk) {
        await writeAudit(tx, {
          actorId: actor.id,
          action: "bulk.created",
          entityType: "BulkOperation",
          entityId: op.id,
          batchId: batch.id,
          summary:
            data.kind === "STATEMENT"
              ? `Requested statements from ${created.length} cadets`
              : `Recorded ${created.length} ${label}s`,
          changes: { kind: data.kind, count: created.length, ids: created.map((c) => c.id) },
        });
      }

      return {
        bulkOperationId: op.id,
        kind: data.kind,
        occurrenceId,
        replayed: false,
        created: created.map((c) => ({ ...c, cadetName: byId.get(c.cadetId)!.name })),
      };
    });
  } catch (e) {
    // Concurrent retry with the same key: the other request won; return its result.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await findBulkResult(data.idempotencyKey, actor.id);
      if (again) return again;
    }
    throw translateDbError(e);
  }
}

async function findBulkResult(idempotencyKey: string, actorId: string): Promise<CreateEntriesResult | null> {
  const op = await prisma.bulkOperation.findUnique({
    where: { idempotencyKey },
    include: {
      records: { select: { id: true, cadetId: true, occurrenceId: true, cadet: { select: { name: true } } } },
      statements: { select: { id: true, cadetId: true, occurrenceId: true, cadet: { select: { name: true } } } },
    },
  });
  if (!op) return null;
  if (op.createdById !== actorId) throw invalid("This request key has already been used.");
  const rows = op.kind === "STATEMENT" ? op.statements : op.records;
  return {
    bulkOperationId: op.id,
    kind: op.kind as EntryKind,
    occurrenceId: rows[0]?.occurrenceId ?? null,
    replayed: true,
    created: rows.map((r) => ({ id: r.id, cadetId: r.cadetId, cadetName: r.cadet.name })),
  };
}
