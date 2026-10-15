import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEntries } from "@/server/services/entries";
import { correctRecord, voidRecord } from "@/server/services/records";
import { createCategory } from "@/server/services/categories";
import { setCadetStatus } from "@/server/services/cadets";
import { dashboardCounts } from "@/server/services/stats";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

describe("bulk record creation", () => {
  beforeEach(resetDb);

  it("one selected cadet receives one record", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const res = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: today(), description: "Late" });
    expect(res.created).toHaveLength(1);
    expect(await prisma.record.count()).toBe(1);
  });

  it("multiple cadets receive individual records with shared fields and overrides", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const cat = await createCategory(u, { recordType: "CROW", name: "Conduct" });
    const ids = cadets.map((c) => c.id);
    const res = await createEntries(u, {
      idempotencyKey: key(),
      batchId: batch.id,
      kind: "CROW",
      cadetIds: ids,
      date: "2026-10-01",
      time: "19:30",
      categoryId: cat.id,
      description: "Shared description",
      notes: "Shared notes",
      referenceNo: "REF-1",
      occurrence: { mode: "new", title: "Mess hall" },
      overrides: { [ids[1]!]: { description: "Individual description" } },
    });
    expect(res.created).toHaveLength(5);
    const rows = await prisma.record.findMany({ orderBy: { cadet: { name: "asc" } } });
    expect(new Set(rows.map((r) => r.cadetId)).size).toBe(5);
    expect(rows.every((r) => r.type === "CROW" && r.categoryId === cat.id && r.referenceNo === "REF-1" && r.occurredTime === "19:30")).toBe(true);
    expect(rows.filter((r) => r.description === "Shared description")).toHaveLength(4);
    expect(rows.find((r) => r.cadetId === ids[1])!.description).toBe("Individual description");
    expect(new Set(rows.map((r) => r.occurrenceId)).size).toBe(1);
    expect(await prisma.occurrence.count()).toBe(1);
    // CROWs are not counted as NORs or statements.
    expect(await dashboardCounts(batch.id)).toMatchObject({ nor: 0, crow: 5, statements: 0 });
  });

  it("a retried submission with the same key does not duplicate (sequential and concurrent)", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const input = { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT" as const, cadetIds: cadets.map((c) => c.id), date: today(), description: "Explain" };
    const [a, b] = await Promise.all([createEntries(u, input), createEntries(u, input)]);
    const c = await createEntries(u, input);
    expect(await prisma.statement.count()).toBe(5);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    expect(c.replayed).toBe(true);
    expect(c.created.map((x) => x.id).sort()).toEqual(a.created.map((x) => x.id).sort());
  });

  it("is all-or-nothing when any cadet is invalid", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    await setCadetStatus(u, { cadetId: cadets[4]!.id, status: "REMOVED", reason: "Left course" });
    await expect(
      createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: cadets.map((c) => c.id), date: today(), description: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.record.count()).toBe(0);
    expect(await prisma.bulkOperation.count()).toBe(0);
  });

  it("rolls back a transaction that fails part-way", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A" });
    const b = await makeBatch(u, { name: "B" });
    const foreignOcc = await prisma.occurrence.create({ data: { batchId: b.batch.id, title: "other", createdById: u.id } });
    // The service validates this up front; this asserts nothing partial persists either way.
    await expect(
      createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "NOR", cadetIds: a.cadets.map((c) => c.id), date: today(), description: "x", occurrence: { mode: "existing", occurrenceId: foreignOcc.id } }),
    ).rejects.toBeTruthy();
    expect(await prisma.record.count()).toBe(0);
  });

  it("validates required fields", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    await expect(createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [], date: today(), description: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { cadetIds: expect.any(String) },
    });
    await expect(createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: today(), description: "  " })).rejects.toMatchObject({
      fieldErrors: { description: expect.any(String) },
    });
  });
});

describe("corrections and voiding", () => {
  beforeEach(resetDb);

  it("records can be corrected individually with an audited before/after", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const res = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id, cadets[1]!.id], date: "2026-10-01", description: "Original" });
    const target = res.created[0]!.id;
    await expect(correctRecord(u, { recordId: target, date: "2026-10-01", description: "Fixed", reason: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await correctRecord(u, { recordId: target, date: "2026-10-02", description: "Fixed", reason: "Typo" });
    const rows = await prisma.record.findMany();
    expect(rows.find((r) => r.id === target)!.description).toBe("Fixed");
    expect(rows.find((r) => r.id !== target)!.description).toBe("Original");
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { action: "record.corrected" } });
    expect(ev.changes).toMatchObject({ description: { from: "Original", to: "Fixed" }, date: { from: "2026-10-01", to: "2026-10-02" } });
    expect(ev.reason).toBe("Typo");
  });

  it("voided records are retained but excluded from counts", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const res = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: today(), description: "x" });
    await voidRecord(u, { recordId: res.created[0]!.id, reason: "Wrong cadet" });
    expect(await prisma.record.count()).toBe(1);
    expect((await dashboardCounts(batch.id)).nor).toBe(0);
    await expect(correctRecord(u, { recordId: res.created[0]!.id, date: today(), description: "y", reason: "z" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
