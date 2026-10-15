import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { activateBatch, archiveBatch, createBatch, getActiveBatch, reopenBatch } from "@/server/services/batches";
import { createEntries } from "@/server/services/entries";
import { createCadet, transferCadet } from "@/server/services/cadets";
import { dashboardCounts } from "@/server/services/stats";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

describe("active batch", () => {
  beforeEach(resetDb);

  it("a newly created batch is not activated automatically and starts empty", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { activate: true });
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "NOR", cadetIds: [a.cadets[0]!.id], date: today(), description: "x" });
    const b = await createBatch(u, { name: "New one" });
    expect((await getActiveBatch())?.id).toBe(a.batch.id);
    const counts = await dashboardCounts(b.id);
    expect(counts).toMatchObject({ cadets: 0, nor: 0, crow: 0, statements: 0 });
  });

  it("switching requires explicit confirmation and exactly one batch is active", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { activate: true });
    const b = await makeBatch(u, { name: "Second" });
    await expect(activateBatch(u, { batchId: b.batch.id, confirmName: "wrong" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getActiveBatch())?.id).toBe(a.batch.id);
    await activateBatch(u, { batchId: b.batch.id, confirmName: "Second" });
    expect((await getActiveBatch())?.id).toBe(b.batch.id);
    const cfgRows = await prisma.appConfig.count();
    expect(cfgRows).toBe(1);
    // The database itself refuses a second config row.
    await expect(prisma.$executeRawUnsafe(`INSERT INTO "AppConfig" ("id","recurringThreshold","updatedAt") VALUES (2,3,NOW())`)).rejects.toThrow();
    expect(await prisma.auditEvent.count({ where: { action: "batch.activated" } })).toBe(2);
  });

  it("historical records stay isolated when the active batch changes", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { activate: true, name: "A" });
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "CROW", cadetIds: a.cadets.map((c) => c.id), date: today(), description: "x" });
    const b = await makeBatch(u, { name: "B" });
    await activateBatch(u, { batchId: b.batch.id, confirmName: "B" });
    expect((await dashboardCounts(b.batch.id)).crow).toBe(0);
    expect((await dashboardCounts(a.batch.id)).crow).toBe(5);
  });

  it("rejects cadets from another batch", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A" });
    const b = await makeBatch(u, { name: "B" });
    await expect(
      createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "NOR", cadetIds: [a.cadets[0]!.id, b.cadets[0]!.id], date: today(), description: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.record.count()).toBe(0);
  });

  it("the database rejects a cadet pointing at another batch's byte or record", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A" });
    const b = await makeBatch(u, { name: "B" });
    await expect(prisma.cadet.update({ where: { id: a.cadets[0]!.id }, data: { byteId: b.bytes[0]!.id } })).rejects.toThrow(/byte does not belong/);
    await expect(
      prisma.record.create({ data: { batchId: a.batch.id, cadetId: b.cadets[0]!.id, type: "NOR", description: "x", occurredOn: new Date(), createdById: u.id } }),
    ).rejects.toThrow();
  });
});

describe("archiving", () => {
  beforeEach(resetDb);

  it("cannot archive the active batch", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { activate: true });
    await expect(archiveBatch(u, { batchId: a.batch.id, acknowledged: true })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires a carry-over note when statements are outstanding, then becomes read-only", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "Old" });
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "STATEMENT", cadetIds: [a.cadets[0]!.id], date: today(), description: "s" });
    await expect(archiveBatch(u, { batchId: a.batch.id, acknowledged: true })).rejects.toMatchObject({ code: "VALIDATION" });
    await archiveBatch(u, { batchId: a.batch.id, acknowledged: true, carryOverNote: "Handed to next course OIC" });
    expect(await prisma.statement.count({ where: { batchId: a.batch.id } })).toBe(1); // nothing deleted

    await expect(
      createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "NOR", cadetIds: [a.cadets[0]!.id], date: today(), description: "x" }),
    ).rejects.toMatchObject({ code: "READ_ONLY" });
    await expect(createCadet(u, a.batch.id, { name: "New" })).rejects.toMatchObject({ code: "READ_ONLY" });
    // Defence in depth: the database also refuses direct writes.
    await expect(prisma.cadet.update({ where: { id: a.cadets[0]!.id }, data: { name: "Changed" } })).rejects.toThrow(/archived/);
  });

  it("reopening requires a reason and is audited", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "Old" });
    await archiveBatch(u, { batchId: a.batch.id, acknowledged: true });
    await expect(reopenBatch(u, { batchId: a.batch.id, reason: " " })).rejects.toMatchObject({ code: "VALIDATION" });
    await reopenBatch(u, { batchId: a.batch.id, reason: "Late correction approved" });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { action: "batch.reopened" } });
    expect(ev.reason).toBe("Late correction approved");
  });

  it("transfer keeps earlier records with the original batch", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A" });
    const b = await makeBatch(u, { name: "B" });
    const cadet = a.cadets[0]!;
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "NOR", cadetIds: [cadet.id], date: today(), description: "x" });
    const moved = await transferCadet(u, { cadetId: cadet.id, targetBatchId: b.batch.id, reason: "Recourse" });
    expect(moved.batchId).toBe(b.batch.id);
    expect(await prisma.record.count({ where: { cadetId: cadet.id, batchId: a.batch.id } })).toBe(1);
    expect(await prisma.record.count({ where: { cadetId: moved.id } })).toBe(0);
    expect((await prisma.cadet.findUniqueOrThrow({ where: { id: cadet.id } })).status).toBe("TRANSFERRED");
    expect(await prisma.auditEvent.count({ where: { action: { startsWith: "cadet.transferred" } } })).toBe(2);
  });
});
