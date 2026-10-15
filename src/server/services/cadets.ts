import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { diff, writeAudit, writeAuditMany } from "@/server/audit";
import { conflict, invalid, notFound, readOnly } from "@/server/errors";
import { id, optionalText, parse, reason, requiredText } from "@/server/validation";
import { OUTSTANDING_STATUSES } from "@/lib/labels";
import { assertBatchWritable, getBatch } from "./batches";

export const ROSTER_FILTERS = ["nor", "crow", "outstanding", "rewrite", "none"] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export type RosterQuery = {
  q?: string;
  byteId?: string;
  filter?: RosterFilter;
  includeInactive?: boolean;
};

export type RosterRow = {
  id: string;
  name: string;
  status: string;
  byteId: string | null;
  byteName: string | null;
  nor: number;
  crow: number;
  statements: number;
  outstanding: number;
  rewrite: number;
};

/** Per-cadet counts within one batch (voided records/statements excluded). */
export async function cadetCounts(batchId: string, cadetIds?: string[]) {
  const cadetWhere = cadetIds ? { cadetId: { in: cadetIds } } : {};
  const [records, statements] = await Promise.all([
    prisma.record.groupBy({
      by: ["cadetId", "type"],
      where: { batchId, status: "ACTIVE", ...cadetWhere },
      _count: true,
    }),
    prisma.statement.groupBy({
      by: ["cadetId", "status"],
      where: { batchId, voided: false, ...cadetWhere },
      _count: true,
    }),
  ]);
  const map = new Map<string, { nor: number; crow: number; statements: number; outstanding: number; rewrite: number }>();
  const get = (cid: string) => {
    let v = map.get(cid);
    if (!v) map.set(cid, (v = { nor: 0, crow: 0, statements: 0, outstanding: 0, rewrite: 0 }));
    return v;
  };
  for (const r of records) {
    const v = get(r.cadetId);
    if (r.type === "NOR") v.nor += r._count;
    else v.crow += r._count;
  }
  for (const s of statements) {
    const v = get(s.cadetId);
    v.statements += s._count;
    if (OUTSTANDING_STATUSES.includes(s.status)) v.outstanding += s._count;
    if (s.status === "REWRITE_REQUIRED") v.rewrite += s._count;
  }
  return map;
}

export async function listRoster(batchId: string, query: RosterQuery = {}): Promise<RosterRow[]> {
  const q = query.q?.trim();
  const where: Prisma.CadetWhereInput = {
    batchId,
    ...(query.includeInactive ? {} : { status: "ACTIVE" }),
    ...(query.byteId ? { byteId: query.byteId === "none" ? null : query.byteId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { byte: { name: { contains: q, mode: "insensitive" } } },
            { notes: { contains: q, mode: "insensitive" } },
            { records: { some: { status: "ACTIVE", description: { contains: q, mode: "insensitive" } } } },
            { records: { some: { status: "ACTIVE", category: { name: { contains: q, mode: "insensitive" } } } } },
            { statements: { some: { voided: false, title: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const cadets = await prisma.cadet.findMany({
    where,
    include: { byte: true },
    orderBy: [{ byte: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const counts = await cadetCounts(batchId);
  const rows: RosterRow[] = cadets.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    byteId: c.byteId,
    byteName: c.byte?.name ?? null,
    nor: 0,
    crow: 0,
    statements: 0,
    outstanding: 0,
    rewrite: 0,
    ...counts.get(c.id),
  }));
  switch (query.filter) {
    case "nor":
      return rows.filter((r) => r.nor > 0);
    case "crow":
      return rows.filter((r) => r.crow > 0);
    case "outstanding":
      return rows.filter((r) => r.outstanding > 0);
    case "rewrite":
      return rows.filter((r) => r.rewrite > 0);
    case "none":
      return rows.filter((r) => r.nor + r.crow + r.statements === 0);
    default:
      return rows;
  }
}

/** Load a cadet and verify it belongs to the given batch (when provided). */
export async function getCadet(cadetId: string, batchId?: string) {
  const cadet = await prisma.cadet.findUnique({
    where: { id: cadetId },
    include: { byte: true, batch: true, transferredFrom: { include: { batch: true } }, transferredTo: { include: { batch: true } } },
  });
  if (!cadet || (batchId && cadet.batchId !== batchId)) throw notFound("Cadet");
  return cadet;
}

async function assertByteInBatch(byteId: string | null | undefined, batchId: string) {
  if (!byteId) return null;
  const byte = await prisma.byte.findFirst({ where: { id: byteId, batchId } });
  if (!byte) throw invalid("Select a byte from this batch.", { byteId: "Select a byte from this batch." });
  return byte;
}

const cadetInput = z.object({
  name: requiredText(120, "Enter the cadet's name."),
  byteId: z.string().max(64).optional().nullable().transform((v) => v || null),
  notes: optionalText(1000),
});

export async function createCadet(actor: Actor, batchId: string, input: z.input<typeof cadetInput>) {
  const data = parse(cadetInput, input);
  const batch = await assertBatchWritable(batchId);
  const byte = await assertByteInBatch(data.byteId, batch.id);
  return prisma.$transaction(async (tx) => {
    const cadet = await tx.cadet.create({ data: { batchId: batch.id, ...data } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "cadet.created",
      entityType: "Cadet",
      entityId: cadet.id,
      batchId: batch.id,
      cadetId: cadet.id,
      summary: `Added ${cadet.name} to the roster${byte ? ` (${byte.name})` : ""}`,
    });
    return cadet;
  });
}

export async function updateCadet(actor: Actor, cadetId: string, input: z.input<typeof cadetInput>) {
  const data = parse(cadetInput, input);
  const cadet = await getCadet(cadetId);
  await assertBatchWritable(cadet.batchId);
  const byte = await assertByteInBatch(data.byteId, cadet.batchId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cadet.update({ where: { id: cadet.id }, data });
    const changes = diff(
      { name: cadet.name, byte: cadet.byte?.name ?? null, notes: cadet.notes },
      { name: updated.name, byte: byte?.name ?? null, notes: updated.notes },
      ["name", "byte", "notes"],
    );
    if (Object.keys(changes).length) {
      await writeAudit(tx, {
        actorId: actor.id,
        action: changes.byte && Object.keys(changes).length === 1 ? "cadet.byte_assigned" : "cadet.updated",
        entityType: "Cadet",
        entityId: cadet.id,
        batchId: cadet.batchId,
        cadetId: cadet.id,
        summary: `Updated cadet ${updated.name}`,
        changes,
      });
    }
    return updated;
  });
}

/** Assign several cadets to a byte in one step. */
export async function assignByte(actor: Actor, input: { batchId: string; cadetIds: string[]; byteId: string | null }) {
  const data = parse(
    z.object({ batchId: id, cadetIds: z.array(id).min(1), byteId: id.nullable() }),
    input,
  );
  await assertBatchWritable(data.batchId);
  const byte = await assertByteInBatch(data.byteId, data.batchId);
  const cadets = await prisma.cadet.findMany({ where: { id: { in: data.cadetIds }, batchId: data.batchId }, include: { byte: true } });
  if (cadets.length !== new Set(data.cadetIds).size) throw invalid("Some selected cadets are not in this batch.");
  return prisma.$transaction(async (tx) => {
    await tx.cadet.updateMany({ where: { id: { in: data.cadetIds }, batchId: data.batchId }, data: { byteId: byte?.id ?? null } });
    await writeAuditMany(
      tx,
      cadets
        .filter((c) => c.byteId !== (byte?.id ?? null))
        .map((c) => ({
          actorId: actor.id,
          action: "cadet.byte_assigned",
          entityType: "Cadet",
          entityId: c.id,
          batchId: data.batchId,
          cadetId: c.id,
          summary: `Moved ${c.name} to ${byte?.name ?? "no byte"}`,
          changes: { byte: { from: c.byte?.name ?? null, to: byte?.name ?? null } },
        })),
    );
    return cadets.length;
  });
}

export async function setCadetStatus(
  actor: Actor,
  input: { cadetId: string; status: "ACTIVE" | "REMOVED"; reason: string },
) {
  const data = parse(z.object({ cadetId: id, status: z.enum(["ACTIVE", "REMOVED"]), reason }), input);
  const cadet = await getCadet(data.cadetId);
  await assertBatchWritable(cadet.batchId);
  if (cadet.status === "TRANSFERRED") throw conflict("A transferred cadet cannot be changed here.");
  if (cadet.status === data.status) return cadet;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cadet.update({ where: { id: cadet.id }, data: { status: data.status } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: data.status === "REMOVED" ? "cadet.removed" : "cadet.restored",
      entityType: "Cadet",
      entityId: cadet.id,
      batchId: cadet.batchId,
      cadetId: cadet.id,
      summary: `${data.status === "REMOVED" ? "Removed" : "Restored"} ${cadet.name} ${data.status === "REMOVED" ? "from" : "to"} the roster`,
      changes: { status: { from: cadet.status, to: data.status } },
      reason: data.reason,
    });
    return updated;
  });
}

/**
 * Transfer a cadet to another batch. Existing records stay with the original
 * batch; a new roster entry is created in the target batch and linked back.
 */
export async function transferCadet(
  actor: Actor,
  input: { cadetId: string; targetBatchId: string; targetByteId?: string | null; reason: string },
) {
  const data = parse(
    z.object({ cadetId: id, targetBatchId: id, targetByteId: id.optional().nullable(), reason }),
    input,
  );
  const cadet = await getCadet(data.cadetId);
  if (cadet.batch.status !== "OPEN") throw readOnly();
  if (cadet.status !== "ACTIVE") throw conflict("Only active cadets can be transferred.");
  if (data.targetBatchId === cadet.batchId) throw invalid("Choose a different batch.");
  const target = await getBatch(data.targetBatchId);
  if (target.status !== "OPEN") throw readOnly("The target batch is archived.");
  const byte = await assertByteInBatch(data.targetByteId, target.id);
  return prisma.$transaction(async (tx) => {
    const created = await tx.cadet.create({
      data: { batchId: target.id, byteId: byte?.id ?? null, name: cadet.name, notes: cadet.notes, transferredFromId: cadet.id },
    });
    await tx.cadet.update({ where: { id: cadet.id }, data: { status: "TRANSFERRED" } });
    const summary = `Transferred ${cadet.name} from ${cadet.batch.name} to ${target.name}`;
    await writeAuditMany(tx, [
      { actorId: actor.id, action: "cadet.transferred_out", entityType: "Cadet", entityId: cadet.id, batchId: cadet.batchId, cadetId: cadet.id, summary, reason: data.reason, changes: { toCadetId: created.id, toBatch: target.name } },
      { actorId: actor.id, action: "cadet.transferred_in", entityType: "Cadet", entityId: created.id, batchId: target.id, cadetId: created.id, summary, reason: data.reason, changes: { fromCadetId: cadet.id, fromBatch: cadet.batch.name } },
    ]);
    return created;
  });
}
