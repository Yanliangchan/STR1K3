import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEntries } from "@/server/services/entries";
import { recordReceipt, reviewStatement, undoStatementChange } from "@/server/services/statements";
import { dashboardCounts } from "@/server/services/stats";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

async function setup() {
  const u = await makeUser();
  const { batch, cadets } = await makeBatch(u, { cadets: 1 });
  const res = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: [cadets[0]!.id], date: today(), dueDate: "2099-01-01", description: "x" });
  return { u, batch, id: res.created[0]!.id };
}

describe("undo", () => {
  beforeEach(resetDb);

  it("undoes a hand-in without deleting it, and numbering continues", async () => {
    const { u, batch, id } = await setup();
    const v = await recordReceipt(u, { statementId: id });
    expect(await undoStatementChange(u, { statementId: id, ref: { type: "version", id: v.id } })).toBe("NOT_SUBMITTED");
    const s = await prisma.statement.findUniqueOrThrow({ where: { id }, include: { versions: true } });
    expect(s.status).toBe("NOT_SUBMITTED");
    expect(s.lastReceivedAt).toBeNull();
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0]!.retractedAt).not.toBeNull();
    expect((await dashboardCounts(batch.id)).notSubmitted).toBe(1);
    const v2 = await recordReceipt(u, { statementId: id });
    expect(v2.versionNumber).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: "statement.undone" } })).toBe(1);
  });

  it("undoes an accept or a rewrite (restoring the previous deadline)", async () => {
    const { u, id } = await setup();
    await recordReceipt(u, { statementId: id });
    const acc = await reviewStatement(u, { statementId: id, outcome: "ACCEPTED" });
    await undoStatementChange(u, { statementId: id, ref: { type: "review", id: acc.id } });
    let s = await prisma.statement.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("PENDING_REVIEW");
    expect(s.acceptedAt).toBeNull();
    const before = s.dueAt.toISOString();
    const rw = await reviewStatement(u, { statementId: id, outcome: "REWRITE_REQUIRED", newDueDate: "2099-06-01" });
    await undoStatementChange(u, { statementId: id, ref: { type: "review", id: rw.id } });
    s = await prisma.statement.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("PENDING_REVIEW");
    expect(s.dueAt.toISOString()).toBe(before);
    expect(await prisma.statementReview.count({ where: { statementId: id } })).toBe(2); // kept, marked retracted
  });

  it("only the same instructor, only the latest change, only within the window", async () => {
    const { u, id } = await setup();
    const other = await makeUser();
    const v = await recordReceipt(u, { statementId: id });
    await expect(undoStatementChange(other, { statementId: id, ref: { type: "version", id: v.id } })).rejects.toMatchObject({ code: "CONFLICT" });
    const r = await reviewStatement(u, { statementId: id, outcome: "ACCEPTED" });
    // The hand-in is no longer undoable once it has been reviewed.
    await expect(undoStatementChange(u, { statementId: id, ref: { type: "version", id: v.id } })).rejects.toMatchObject({ code: "CONFLICT" });
    await prisma.statementReview.update({ where: { id: r.id }, data: { reviewedAt: new Date(Date.now() - 5 * 60_000) } });
    await expect(undoStatementChange(u, { statementId: id, ref: { type: "review", id: r.id } })).rejects.toThrow(/2 minutes/);
  });
});
