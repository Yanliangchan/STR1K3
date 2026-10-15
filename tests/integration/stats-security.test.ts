import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEntries } from "@/server/services/entries";
import { createCategory } from "@/server/services/categories";
import { recurringFlags, updateRecurringConfig } from "@/server/services/recurring";
import { dashboardCounts, statistics } from "@/server/services/stats";
import { recordReceipt, reviewStatement } from "@/server/services/statements";
import { buildExport, commitImport, previewImport } from "@/server/services/importExport";
import { csvCell } from "@/lib/csv";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

describe("statistics", () => {
  beforeEach(resetDb);

  it("dashboard counts match the database and ignore other batches", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A" });
    const b = await makeBatch(u, { name: "B" });
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "NOR", cadetIds: a.cadets.slice(0, 3).map((c) => c.id), date: today(), description: "x" });
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "CROW", cadetIds: [a.cadets[0]!.id], date: today(), description: "x" });
    const st = await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "STATEMENT", dueDate: "2099-01-01", cadetIds: a.cadets.slice(0, 2).map((c) => c.id), date: today(), description: "x" });
    await createEntries(u, { idempotencyKey: key(), batchId: b.batch.id, kind: "NOR", cadetIds: b.cadets.map((c) => c.id), date: today(), description: "x" });
    await recordReceipt(u, { statementId: st.created[0]!.id });
    await reviewStatement(u, { statementId: st.created[0]!.id, outcome: "REWRITE_REQUIRED", feedback: "f", newDueDate: "2099-01-02" });
    await recordReceipt(u, { statementId: st.created[0]!.id });

    const c = await dashboardCounts(a.batch.id);
    expect(c).toMatchObject({ cadets: 5, nor: 3, crow: 1, statements: 2, pendingReview: 1, notSubmitted: 1 });
    expect(c.nor).toBe(await prisma.record.count({ where: { batchId: a.batch.id, type: "NOR", status: "ACTIVE" } }));

    const s = await statistics(a.batch.id);
    expect(s.distribution).toEqual({ nor: 3, crow: 1, statements: 2 });
    const filtered = await statistics(a.batch.id, { byteId: a.bytes[0]!.id });
    expect(filtered.distribution.nor).toBe(2); // cadets 1 and 3 are in Byte 1
    expect(s.outstanding.at(-1)?.outstanding).toBe(2);
  });

  it("recurring flags count a shared occurrence once and mark ambiguous cases for manual review", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const cat = await createCategory(u, { recordType: "NOR", name: "Punctuality" });
    const cad = cadets[0]!.id;
    const nor = (date: string, occurrence?: { mode: "existing"; occurrenceId: string } | { mode: "new" }) =>
      createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cad], date, description: "Late", categoryId: cat.id, occurrence });

    // Three documents about ONE occurrence -> no flag.
    const first = await nor("2026-10-01", { mode: "new" });
    await nor("2026-10-01", { mode: "existing", occurrenceId: first.occurrenceId! });
    await nor("2026-10-01", { mode: "existing", occurrenceId: first.occurrenceId! });
    expect(await recurringFlags(batch.id)).toHaveLength(0);

    // Two more unlinked records on the same day: could be 3 occurrences or 2 -> manual review.
    await nor("2026-10-05");
    await nor("2026-10-05");
    let flags = await recurringFlags(batch.id);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ needsManualReview: true, distinctOccurrences: 2, recordCount: 5 });

    // A third clearly distinct date -> confident flag.
    await nor("2026-10-09");
    flags = await recurringFlags(batch.id);
    expect(flags[0]).toMatchObject({ needsManualReview: false, distinctOccurrences: 3 });

    // Statements never feed the flag, and flags never create records.
    expect(await prisma.record.count()).toBe(6);
    await updateRecurringConfig(u, { threshold: 10, windowDays: null });
    expect(await recurringFlags(batch.id)).toHaveLength(0);
  });
});

describe("security and audit", () => {
  beforeEach(resetDb);

  it("audit events cannot be modified or deleted", async () => {
    const u = await makeUser();
    await makeBatch(u);
    const ev = await prisma.auditEvent.findFirstOrThrow();
    await expect(prisma.auditEvent.update({ where: { id: ev.id }, data: { summary: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id: ev.id } })).rejects.toThrow(/append-only/);
  });

  it("records, statements and versions cannot be hard-deleted", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    const r = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: today(), description: "x" });
    await expect(prisma.record.delete({ where: { id: r.created[0]!.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("CSV export neutralises formula injection", async () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("normal, text")).toBe('"normal, text"');
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u);
    await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: today(), description: "=cmd|' /C calc'!A0" });
    const { csv } = await buildExport(u, { batchId: batch.id, dataset: "records" });
    expect(csv).toContain("'=cmd");
    expect(await prisma.auditEvent.count({ where: { action: "export.created" } })).toBe(1);
  });

  it("export is scoped to the requested batch", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A" });
    const b = await makeBatch(u, { name: "B" });
    await createEntries(u, { idempotencyKey: key(), batchId: b.batch.id, kind: "NOR", cadetIds: [b.cadets[0]!.id], date: today(), description: "secret-b" });
    const { csv } = await buildExport(u, { batchId: a.batch.id, dataset: "records" });
    expect(csv).not.toContain("secret-b");
  });
});

describe("CSV roster import", () => {
  beforeEach(resetDb);

  it("previews, reports row-level errors and never writes until confirmed", async () => {
    const u = await makeUser();
    const { batch } = await makeBatch(u, { cadets: 1 });
    const csv = "name,byte\nNew Person,Byte 1\n,Byte 2\nOther Person,Byte 9\nCadet 01,Byte 2\n";
    const p = await previewImport(batch.id, csv, { createMissingBytes: false, includeDuplicates: false });
    expect(p.rows.map((r) => r.line)).toEqual([2, 3, 4, 5]);
    expect(p.rows[1]!.errors[0]).toMatch(/Name is required/);
    expect(p.rows[2]!.errors[0]).toMatch(/Byte 9/);
    expect(p.rows[3]!.warnings[0]).toMatch(/already on the roster/);
    expect(await prisma.cadet.count({ where: { batchId: batch.id } })).toBe(1);
    await expect(commitImport(u, { batchId: batch.id, csvText: csv, createMissingBytes: false, includeDuplicates: false })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.cadet.count({ where: { batchId: batch.id } })).toBe(1);
  });

  it("imports valid rows into the selected batch only, without overwriting", async () => {
    const u = await makeUser();
    const { batch } = await makeBatch(u, { cadets: 1 });
    const other = await makeBatch(u, { cadets: 0, name: "Other" });
    const res = await commitImport(u, { batchId: batch.id, csvText: "name,byte\nA One,Byte 1\nB Two,Byte 3\nCadet 01,\n", createMissingBytes: true, includeDuplicates: false });
    expect(res).toEqual({ created: 2, newBytes: 1 });
    expect(await prisma.cadet.count({ where: { batchId: batch.id } })).toBe(3);
    expect(await prisma.cadet.count({ where: { batchId: other.batch.id } })).toBe(0);
  });
});
