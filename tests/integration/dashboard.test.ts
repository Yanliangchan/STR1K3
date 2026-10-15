import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEntries } from "@/server/services/entries";
import { actionNeededCount, recordReceipt, reviewStatement } from "@/server/services/statements";
import { flaggedCadets, insights, outstandingByCadet } from "@/server/services/dashboard";
import { createCategory } from "@/server/services/categories";
import { updateRecurringConfig } from "@/server/services/recurring";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

describe("dashboard", () => {
  beforeEach(resetDb);

  it("lists cadets with outstanding statements, overdue first, then due soon, then awaiting review", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 4 });
    const [a, b, c, d] = cadets as [(typeof cadets)[0], (typeof cadets)[0], (typeof cadets)[0], (typeof cadets)[0]];
    await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: [a.id], date: "2099-01-01", dueDate: "2099-02-01", description: "later" });
    const review = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: [b.id], date: "2026-01-01", dueDate: "2099-01-01", description: "review" });
    await recordReceipt(u, { statementId: review.created[0]!.id });
    await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: [c.id], date: "2026-01-01", dueDate: "2026-01-02", description: "overdue" });
    const accepted = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: [d.id], date: "2026-01-01", dueDate: "2099-01-01", description: "done" });
    await recordReceipt(u, { statementId: accepted.created[0]!.id });
    await reviewStatement(u, { statementId: accepted.created[0]!.id, outcome: "ACCEPTED" });

    const res = await outstandingByCadet(batch.id);
    expect(res.cadets.map((x) => x.cadetId)).toEqual([c.id, b.id, a.id]); // accepted cadet not listed
    expect(res.totals).toMatchObject({ outstanding: 3, overdue: 1, awaitingReview: 1 });
    // Nav badge: overdue + handed in; not-yet-due and accepted don't count.
    expect(await actionNeededCount(batch.id)).toBe(2);
  });

  it("flags cadets by distinct occurrences or statements, with reasons, using configurable thresholds", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 3 });
    const [a, b, c] = cadets as [(typeof cadets)[0], (typeof cadets)[0], (typeof cadets)[0]];
    // a: 3 separate NORs -> flagged
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
      await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [a.id], date: d, description: "x" });
    }
    // b: 3 records about ONE occurrence -> not flagged
    const first = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [b.id], date: "2026-10-01", description: "x", occurrence: { mode: "new" } });
    for (let i = 0; i < 2; i++) {
      await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "CROW", cadetIds: [b.id], date: "2026-10-01", description: "x", occurrence: { mode: "existing", occurrenceId: first.occurrenceId! } });
    }
    // c: 3 statements -> flagged
    for (let i = 0; i < 3; i++) {
      await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: [c.id], date: today(), dueDate: "2099-01-01", description: `s${i}` });
    }
    let res = await flaggedCadets(batch.id);
    expect(res.cadets.map((x) => x.cadetId).sort()).toEqual([a.id, c.id].sort());
    expect(res.cadets.find((x) => x.cadetId === a.id)!.reasons[0]).toMatch(/3 separate occurrences recorded \(3 NOR\)/);
    expect(res.cadets.find((x) => x.cadetId === c.id)!.reasons[0]).toMatch(/3 statements requested/);

    await updateRecurringConfig(u, { threshold: 3, windowDays: null, flagRecordThreshold: 4, flagStatementThreshold: 10 });
    res = await flaggedCadets(batch.id);
    expect(res.cadets).toHaveLength(0);
    expect(await prisma.record.count()).toBe(6); // flags never create records
  });

  it("includes a repeated-category reason", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const cat = await createCategory(u, { recordType: "NOR", name: "Punctuality" });
    for (const d of ["2026-10-01", "2026-10-05", "2026-10-09"]) {
      await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: d, description: "late", categoryId: cat.id });
    }
    const res = await flaggedCadets(batch.id);
    expect(res.cadets[0]!.reasons).toContain("Punctuality (NOR) repeated 3×");
  });

  it("insights explain findings and only appear with enough data", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 4 });
    expect(await insights(batch.id)).toEqual([]);
    await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: cadets.map((c) => c.id), date: "2026-01-01", dueDate: "2026-01-02", description: "x" });
    const out = await insights(batch.id);
    const overdue = out.find((i) => i.key === "overdue")!;
    expect(overdue.headline).toBe("4 of 4 statements still owed by cadets are past their deadline");
    expect(overdue.why.length).toBeGreaterThan(20);
    // Hand all in late -> late-rate insight appears.
    for (const id of (await prisma.statement.findMany()).map((s) => s.id)) await recordReceipt(u, { statementId: id });
    const late = (await insights(batch.id)).find((i) => i.key === "late")!;
    expect(late.headline).toMatch(/4 of 4 hand-ins \(100%\) came in after the deadline/);
  });
});
