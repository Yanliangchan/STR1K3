import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { conflict, invalid, notFound } from "@/server/errors";
import { id, parse, requiredText } from "@/server/validation";
import { assertBatchWritable } from "./batches";

export async function listBytes(batchId: string, includeInactive = false) {
  return prisma.byte.findMany({
    where: { batchId, ...(includeInactive ? {} : { status: "ACTIVE" }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

async function assertUniqueName(batchId: string, name: string, exceptId?: string) {
  const clash = await prisma.byte.findFirst({
    where: { batchId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw invalid("A byte with this name already exists in this batch.", { name: "Name already used." });
}

export async function createByte(actor: Actor, input: { batchId: string; name: string }) {
  const data = parse(z.object({ batchId: id, name: requiredText(40, "Enter a byte name.") }), input);
  const batch = await assertBatchWritable(data.batchId);
  await assertUniqueName(batch.id, data.name);
  const max = await prisma.byte.aggregate({ where: { batchId: batch.id }, _max: { sortOrder: true } });
  return prisma.$transaction(async (tx) => {
    const byte = await tx.byte.create({
      data: { batchId: batch.id, name: data.name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "byte.created",
      entityType: "Byte",
      entityId: byte.id,
      batchId: batch.id,
      summary: `Created byte ${byte.name}`,
    });
    return byte;
  });
}

export async function updateByte(
  actor: Actor,
  input: { byteId: string; name: string; status?: "ACTIVE" | "INACTIVE" },
) {
  const data = parse(
    z.object({ byteId: id, name: requiredText(40, "Enter a byte name."), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }),
    input,
  );
  const byte = await prisma.byte.findUnique({ where: { id: data.byteId } });
  if (!byte) throw notFound("Byte");
  await assertBatchWritable(byte.batchId);
  await assertUniqueName(byte.batchId, data.name, byte.id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.byte.update({
      where: { id: byte.id },
      data: { name: data.name, status: data.status ?? byte.status },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "byte.updated",
      entityType: "Byte",
      entityId: byte.id,
      batchId: byte.batchId,
      summary: `Updated byte ${byte.name}${byte.name !== updated.name ? ` → ${updated.name}` : ""}`,
      changes: { name: { from: byte.name, to: updated.name }, status: { from: byte.status, to: updated.status } },
    });
    return updated;
  });
}

export async function deleteByte(actor: Actor, input: { byteId: string }) {
  const byte = await prisma.byte.findUnique({ where: { id: input.byteId }, include: { _count: { select: { cadets: true } } } });
  if (!byte) throw notFound("Byte");
  await assertBatchWritable(byte.batchId);
  if (byte._count.cadets > 0) throw conflict("Move the cadets in this byte first, or mark the byte inactive.");
  return prisma.$transaction(async (tx) => {
    await tx.byte.delete({ where: { id: byte.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "byte.deleted",
      entityType: "Byte",
      entityId: byte.id,
      batchId: byte.batchId,
      summary: `Deleted empty byte ${byte.name}`,
    });
  });
}
