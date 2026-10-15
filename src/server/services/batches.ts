import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit, diff } from "@/server/audit";
import { conflict, invalid, notFound, readOnly, translateDbError } from "@/server/errors";
import { id, optionalText, parse, reason, requiredText } from "@/server/validation";
import { OUTSTANDING_STATUSES } from "@/lib/labels";

export async function getActiveBatch() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, include: { activeBatch: true } });
  return cfg?.activeBatch ?? null;
}

export async function getBatch(batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound("Batch");
  return batch;
}

/** Throws unless the batch exists and is OPEN. Used before every write. */
export async function assertBatchWritable(batchId: string) {
  const batch = await getBatch(batchId);
  if (batch.status !== "OPEN") throw readOnly();
  return batch;
}

export async function listBatches() {
  const [batches, cfg, cadetCounts] = await Promise.all([
    prisma.batch.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { bytes: true } }),
    prisma.appConfig.findUnique({ where: { id: 1 } }),
    prisma.cadet.groupBy({ by: ["batchId"], where: { status: "ACTIVE" }, _count: true }),
  ]);
  const counts = new Map(cadetCounts.map((c) => [c.batchId, c._count]));
  return batches.map((b) => ({
    ...b,
    isActive: cfg?.activeBatchId === b.id,
    cadetCount: counts.get(b.id) ?? 0,
  }));
}

const batchSchema = z.object({
  name: requiredText(60, "Enter a batch name."),
  description: optionalText(500),
  expectedSize: z.coerce.number().int().min(1).max(1000).optional().nullable(),
});

export async function createBatch(
  actor: Actor,
  input: { name: string; description?: string | null; expectedSize?: number | null; bytes?: string[] },
) {
  const data = parse(batchSchema, input);
  const byteNames = uniqueNames(input.bytes ?? []);
  const existing = await prisma.batch.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } });
  if (existing) throw invalid("A batch with this name already exists.", { name: "A batch with this name already exists." });
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        name: data.name,
        description: data.description,
        expectedSize: data.expectedSize ?? null,
        createdById: actor.id,
        bytes: { create: byteNames.map((name, i) => ({ name, sortOrder: i })) },
      },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "batch.created",
      entityType: "Batch",
      entityId: batch.id,
      batchId: batch.id,
      summary: `Created batch ${batch.name}${byteNames.length ? ` with ${byteNames.length} bytes` : ""}`,
    });
    return batch;
  });
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = raw.trim();
    if (!n) continue;
    if (n.length > 40) throw invalid(`Byte name "${n.slice(0, 20)}…" is too long.`);
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export async function updateBatch(
  actor: Actor,
  batchId: string,
  input: { name: string; description?: string | null; expectedSize?: number | null },
) {
  const data = parse(batchSchema, input);
  const batch = await assertBatchWritable(batchId);
  const clash = await prisma.batch.findFirst({
    where: { id: { not: batchId }, name: { equals: data.name, mode: "insensitive" } },
  });
  if (clash) throw invalid("A batch with this name already exists.", { name: "A batch with this name already exists." });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.batch.update({
      where: { id: batchId },
      data: { name: data.name, description: data.description, expectedSize: data.expectedSize ?? null },
    });
    const changes = diff(batch, updated, ["name", "description", "expectedSize"]);
    if (Object.keys(changes).length) {
      await writeAudit(tx, {
        actorId: actor.id,
        action: "batch.updated",
        entityType: "Batch",
        entityId: batchId,
        batchId,
        summary: `Updated batch details for ${updated.name}`,
        changes,
      });
    }
    return updated;
  });
}

/** Explicitly designate the active batch. The caller must confirm by passing the batch name. */
export async function activateBatch(actor: Actor, input: { batchId: string; confirmName: string }) {
  const { batchId, confirmName } = parse(z.object({ batchId: id, confirmName: z.string() }), input);
  const batch = await getBatch(batchId);
  if (batch.status !== "OPEN") throw conflict("An archived batch cannot be made active. Reopen it first.");
  if (confirmName.trim() !== batch.name) {
    throw invalid("Type the batch name exactly to confirm.", { confirmName: "Does not match the batch name." });
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.appConfig.findUnique({ where: { id: 1 }, include: { activeBatch: true } });
      if (before?.activeBatchId === batchId) return batch;
      await tx.appConfig.upsert({
        where: { id: 1 },
        update: { activeBatchId: batchId },
        create: { id: 1, activeBatchId: batchId },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "batch.activated",
        entityType: "Batch",
        entityId: batchId,
        batchId,
        summary: `Set ${batch.name} as the active batch${before?.activeBatch ? ` (previously ${before.activeBatch.name})` : ""}`,
        changes: { activeBatch: { from: before?.activeBatch?.name ?? null, to: batch.name } },
      });
      return batch;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

export async function getArchiveChecklist(batchId: string) {
  const batch = await getBatch(batchId);
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const grouped = await prisma.statement.groupBy({
    by: ["status"],
    where: { batchId, voided: false, status: { in: OUTSTANDING_STATUSES } },
    _count: true,
  });
  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Record<string, number>;
  const outstanding = grouped.reduce((n, g) => n + g._count, 0);
  const unassignedCadets = await prisma.cadet.count({ where: { batchId, status: "ACTIVE", byteId: null } });
  return {
    batch,
    isActive: cfg?.activeBatchId === batchId,
    outstanding,
    notSubmitted: byStatus.NOT_SUBMITTED ?? 0,
    pendingReview: byStatus.PENDING_REVIEW ?? 0,
    rewriteRequired: byStatus.REWRITE_REQUIRED ?? 0,
    unassignedCadets,
  };
}

export async function archiveBatch(
  actor: Actor,
  input: { batchId: string; acknowledged: boolean; carryOverNote?: string | null },
) {
  const data = parse(
    z.object({ batchId: id, acknowledged: z.boolean(), carryOverNote: optionalText(1000) }),
    input,
  );
  const checklist = await getArchiveChecklist(data.batchId);
  if (checklist.batch.status === "ARCHIVED") throw conflict("This batch is already archived.");
  if (checklist.isActive) throw conflict("The active batch cannot be archived. Activate another batch first.");
  if (!data.acknowledged) throw invalid("Confirm that you have reviewed the checklist.", { acknowledged: "Required." });
  if (checklist.outstanding > 0 && !data.carryOverNote) {
    throw invalid("Outstanding statements remain. Record the approved carry-over arrangement.", {
      carryOverNote: "Required when statements are outstanding.",
    });
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.batch.update({
        where: { id: data.batchId, status: "OPEN" },
        data: { status: "ARCHIVED", archivedAt: new Date(), archivedById: actor.id, archiveNote: data.carryOverNote },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "batch.archived",
        entityType: "Batch",
        entityId: updated.id,
        batchId: updated.id,
        summary: `Archived batch ${updated.name}${checklist.outstanding ? ` with ${checklist.outstanding} outstanding statements carried over` : ""}`,
        changes: { outstandingStatements: checklist.outstanding },
        reason: data.carryOverNote,
      });
      return updated;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

export async function reopenBatch(actor: Actor, input: { batchId: string; reason: string }) {
  const data = parse(z.object({ batchId: id, reason }), input);
  const batch = await getBatch(data.batchId);
  if (batch.status !== "ARCHIVED") throw conflict("This batch is not archived.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.batch.update({
      where: { id: batch.id },
      data: { status: "OPEN", archivedAt: null, archivedById: null },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "batch.reopened",
      entityType: "Batch",
      entityId: batch.id,
      batchId: batch.id,
      summary: `Reopened archived batch ${batch.name}`,
      reason: data.reason,
    });
    return updated;
  });
}
