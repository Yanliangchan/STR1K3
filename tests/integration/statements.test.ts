import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEntries } from "@/server/services/entries";
import { bulkStatementAction, recordReceipt, reopenStatement, reviewStatement, voidStatement } from "@/server/services/statements";
import { dashboardCounts } from "@/server/services/stats";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

async function setup(n = 5) {
  const u = await makeUser();
  const { batch, cadets } = await makeBatch(u, { cadets: n });
  const res = await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "STATEMENT", cadetIds: cadets.map((c) => c.id), date: today(), description: "Account for missing food" });
  return { u, batch, ids: res.created.map((c) => c.id) };
}

describe("statement workflow", () => {
  beforeEach(resetDb);

  it("each cadet's statement status is independent across all four statuses", async () => {
    const { u, batch, ids } = await setup();
    const [a, b, c, d] = ids as [string, string, string, string, string];
    await recordReceipt(u, { statementId: a, content: "v1" });
    await reviewStatement(u, { statementId: a, outcome: "ACCEPTED" });
    await recordReceipt(u, { statementId: b, content: "v1" });
    await recordReceipt(u, { statementId: d, content: "v1" });
    await reviewStatement(u, { statementId: d, outcome: "REWRITE_REQUIRED", feedback: "More detail" });
    const statuses = Object.fromEntries((await prisma.statement.findMany()).map((s) => [s.id, s.status]));
    expect(statuses[a]).toBe("ACCEPTED");
    expect(statuses[b]).toBe("PENDING_REVIEW");
    expect(statuses[c]).toBe("NOT_SUBMITTED");
    expect(statuses[d]).toBe("REWRITE_REQUIRED");
    expect(await dashboardCounts(batch.id)).toMatchObject({ statements: 5, accepted: 1, pendingReview: 1, notSubmitted: 2, rewriteRequired: 1, outstanding: 4, nor: 0, crow: 0 });
  });

  it("a rewrite creates a new version, keeps the old one and its feedback, and returns to Pending review", async () => {
    const { u, batch, ids } = await setup(1);
    const id = ids[0]!;
    await recordReceipt(u, { statementId: id, content: "first" });
    await reviewStatement(u, { statementId: id, outcome: "REWRITE_REQUIRED", feedback: "Add times" });
    await recordReceipt(u, { statementId: id, content: "second" });
    const s = await prisma.statement.findUniqueOrThrow({ where: { id }, include: { versions: { include: { reviews: true }, orderBy: { versionNumber: "asc" } } } });
    expect(s.status).toBe("PENDING_REVIEW"); // not auto-accepted
    expect(s.versions.map((v) => v.content)).toEqual(["first", "second"]);
    expect(s.versions[0]!.reviews[0]).toMatchObject({ outcome: "REWRITE_REQUIRED", feedback: "Add times" });
    expect((await dashboardCounts(batch.id)).statements).toBe(1); // versions are not statements
  });

  it("rejects invalid transitions and requires feedback for rewrites", async () => {
    const { u, ids } = await setup(1);
    const id = ids[0]!;
    await expect(reviewStatement(u, { statementId: id, outcome: "ACCEPTED" })).rejects.toMatchObject({ code: "CONFLICT" });
    await recordReceipt(u, { statementId: id });
    await expect(recordReceipt(u, { statementId: id })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(reviewStatement(u, { statementId: id, outcome: "REWRITE_REQUIRED" })).rejects.toMatchObject({ fieldErrors: { feedback: expect.any(String) } });
    await expect(recordReceipt(u, { statementId: id, expectedStatus: "NOT_SUBMITTED" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accepted statements reopen only with a reason, preserving the earlier review", async () => {
    const { u, ids } = await setup(1);
    const id = ids[0]!;
    await recordReceipt(u, { statementId: id, content: "x" });
    await reviewStatement(u, { statementId: id, outcome: "ACCEPTED" });
    await expect(reopenStatement(u, { statementId: id, to: "PENDING_REVIEW", reason: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await reopenStatement(u, { statementId: id, to: "PENDING_REVIEW", reason: "New information" });
    await reviewStatement(u, { statementId: id, outcome: "REWRITE_REQUIRED", feedback: "Clarify" });
    const reviews = await prisma.statementReview.findMany({ where: { statementId: id }, orderBy: { reviewedAt: "asc" } });
    expect(reviews.map((r) => r.outcome)).toEqual(["ACCEPTED", "REWRITE_REQUIRED"]);
    expect((await prisma.auditEvent.findFirstOrThrow({ where: { action: "statement.reopened" } })).reason).toBe("New information");
  });

  it("bulk accept is all-or-nothing and requires a matching confirmation", async () => {
    const { u, batch, ids } = await setup(3);
    await recordReceipt(u, { statementId: ids[0]! });
    await recordReceipt(u, { statementId: ids[1]! });
    await expect(bulkStatementAction(u, { batchId: batch.id, statementIds: ids, action: "ACCEPT", confirmCount: 3 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.statement.count({ where: { status: "ACCEPTED" } })).toBe(0);
    await expect(bulkStatementAction(u, { batchId: batch.id, statementIds: ids.slice(0, 2), action: "ACCEPT", confirmCount: 3 })).rejects.toMatchObject({ code: "VALIDATION" });
    await bulkStatementAction(u, { batchId: batch.id, statementIds: ids.slice(0, 2), action: "ACCEPT", confirmCount: 2 });
    expect(await prisma.statement.count({ where: { status: "ACCEPTED" } })).toBe(2);
  });

  it("voided statements leave the counts and cannot be changed", async () => {
    const { u, batch, ids } = await setup(2);
    await voidStatement(u, { statementId: ids[0]!, reason: "Created in error" });
    expect((await dashboardCounts(batch.id)).statements).toBe(1);
    await expect(recordReceipt(u, { statementId: ids[0]! })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
