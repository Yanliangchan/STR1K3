"use server";

import { revalidatePath } from "next/cache";
import { authed } from "@/server/action";
import * as batches from "@/server/services/batches";
import * as bytes from "@/server/services/bytes";
import * as cadets from "@/server/services/cadets";
import * as categories from "@/server/services/categories";
import * as entries from "@/server/services/entries";
import * as records from "@/server/services/records";
import * as statements from "@/server/services/statements";
import * as users from "@/server/services/users";
import * as io from "@/server/services/importExport";
import { updateRecurringConfig } from "@/server/services/recurring";

function done<T>(v: T) {
  revalidatePath("/", "layout");
  return v;
}

// ----- Records & statements -----
export async function createEntriesAction(input: entries.CreateEntriesInput) {
  return authed(async ({ actor }) => done(await entries.createEntries(actor, input)));
}
export async function correctRecordAction(input: Parameters<typeof records.correctRecord>[1]) {
  return authed(async ({ actor }) => done(void (await records.correctRecord(actor, input))));
}
export async function voidRecordAction(input: { recordId: string; reason: string }) {
  return authed(async ({ actor }) => done(void (await records.voidRecord(actor, input))));
}
export async function recordReceiptAction(input: Parameters<typeof statements.recordReceipt>[1]) {
  return authed(async ({ actor }) => {
    const v = await statements.recordReceipt(actor, input);
    return done({ undo: { type: "version", id: v.id } as statements.UndoRef });
  });
}
export async function reviewStatementAction(input: Parameters<typeof statements.reviewStatement>[1]) {
  return authed(async ({ actor }) => {
    const r = await statements.reviewStatement(actor, input);
    return done({ undo: { type: "review", id: r.id } as statements.UndoRef });
  });
}
export async function undoStatementAction(input: { statementId: string; ref: statements.UndoRef }) {
  return authed(async ({ actor }) => done(await statements.undoStatementChange(actor, input)));
}
export async function reopenStatementAction(input: Parameters<typeof statements.reopenStatement>[1]) {
  return authed(async ({ actor }) => done(void (await statements.reopenStatement(actor, input))));
}
export async function updateStatementDetailsAction(input: Parameters<typeof statements.updateStatementDetails>[1]) {
  return authed(async ({ actor }) => done(void (await statements.updateStatementDetails(actor, input))));
}
export async function voidStatementAction(input: { statementId: string; reason: string }) {
  return authed(async ({ actor }) => done(void (await statements.voidStatement(actor, input))));
}
export async function bulkStatementAction(input: Parameters<typeof statements.bulkStatementAction>[1]) {
  return authed(async ({ actor }) => done(await statements.bulkStatementAction(actor, input)));
}

// ----- Batches -----
export async function createBatchAction(input: Parameters<typeof batches.createBatch>[1]) {
  return authed(async ({ actor }) => done((await batches.createBatch(actor, input)).id));
}
export async function updateBatchAction(batchId: string, input: Parameters<typeof batches.updateBatch>[2]) {
  return authed(async ({ actor }) => done(void (await batches.updateBatch(actor, batchId, input))));
}
export async function activateBatchAction(input: { batchId: string; confirmName: string }) {
  return authed(async ({ actor }) => done(void (await batches.activateBatch(actor, input))));
}
export async function archiveBatchAction(input: Parameters<typeof batches.archiveBatch>[1]) {
  return authed(async ({ actor }) => done(void (await batches.archiveBatch(actor, input))));
}
export async function reopenBatchAction(input: { batchId: string; reason: string }) {
  return authed(async ({ actor }) => done(void (await batches.reopenBatch(actor, input))));
}

// ----- Bytes & cadets -----
export async function createByteAction(input: { batchId: string; name: string }) {
  return authed(async ({ actor }) => done(void (await bytes.createByte(actor, input))));
}
export async function updateByteAction(input: Parameters<typeof bytes.updateByte>[1]) {
  return authed(async ({ actor }) => done(void (await bytes.updateByte(actor, input))));
}
export async function deleteByteAction(input: { byteId: string }) {
  return authed(async ({ actor }) => done(void (await bytes.deleteByte(actor, input))));
}
export async function createCadetAction(batchId: string, input: Parameters<typeof cadets.createCadet>[2]) {
  return authed(async ({ actor }) => done((await cadets.createCadet(actor, batchId, input)).id));
}
export async function updateCadetAction(cadetId: string, input: Parameters<typeof cadets.updateCadet>[2]) {
  return authed(async ({ actor }) => done(void (await cadets.updateCadet(actor, cadetId, input))));
}
export async function assignByteAction(input: Parameters<typeof cadets.assignByte>[1]) {
  return authed(async ({ actor }) => done(await cadets.assignByte(actor, input)));
}
export async function setCadetStatusAction(input: Parameters<typeof cadets.setCadetStatus>[1]) {
  return authed(async ({ actor }) => done(void (await cadets.setCadetStatus(actor, input))));
}
export async function transferCadetAction(input: Parameters<typeof cadets.transferCadet>[1]) {
  return authed(async ({ actor }) => done((await cadets.transferCadet(actor, input)).id));
}
export async function previewImportAction(input: { batchId: string; csvText: string; createMissingBytes: boolean; includeDuplicates: boolean }) {
  return authed(async () => io.previewImport(input.batchId, input.csvText, input));
}
export async function commitImportAction(input: Parameters<typeof io.commitImport>[1]) {
  return authed(async ({ actor }) => done(await io.commitImport(actor, input)));
}

// ----- Settings -----
export async function createCategoryAction(input: Parameters<typeof categories.createCategory>[1]) {
  return authed(async ({ actor }) => done(void (await categories.createCategory(actor, input))));
}
export async function updateCategoryAction(input: Parameters<typeof categories.updateCategory>[1]) {
  return authed(async ({ actor }) => done(void (await categories.updateCategory(actor, input))));
}
export async function updateRecurringAction(input: Parameters<typeof updateRecurringConfig>[1]) {
  return authed(async ({ actor }) => done(void (await updateRecurringConfig(actor, input))));
}
export async function createUserAction(input: Parameters<typeof users.createUser>[1]) {
  return authed(async ({ actor }) => done(void (await users.createUser(actor, input))));
}
export async function updateUserAction(input: Parameters<typeof users.updateUser>[1]) {
  return authed(async ({ actor }) => done(void (await users.updateUser(actor, input))));
}
export async function resetUserPasswordAction(input: { userId: string; password: string }) {
  return authed(async ({ actor }) => done(void (await users.resetUserPassword(actor, input))));
}

// ----- Command palette -----
export async function quickSearchAction(q: string) {
  return authed(async () => {
    const { getActiveBatch } = await import("@/server/services/batches");
    const { quickSearch } = await import("@/server/services/quicksearch");
    const active = await getActiveBatch();
    if (!active) return { cadets: [], statements: [], records: [] };
    return quickSearch(active.id, typeof q === "string" ? q : "");
  });
}
