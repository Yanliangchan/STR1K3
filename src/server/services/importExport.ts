import { z } from "zod";
import type { RecordType, StatementStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit, writeAuditMany } from "@/server/audit";
import { invalid } from "@/server/errors";
import { parseCsv, toCsv } from "@/lib/csv";
import { dateOnlyISO, toISODateInTz, toTimeInTz } from "@/lib/dates";
import { statementStatusLabel } from "@/lib/labels";
import { assertBatchWritable, getBatch } from "./batches";
import { recordWhere } from "./records";
import { statementWhere } from "./statements";

export const MAX_IMPORT_ROWS = 1000;

export type ImportRow = {
  line: number;
  name: string;
  byte: string;
  notes: string;
  errors: string[];
  warnings: string[];
  willCreateByte: boolean;
};

export type ImportPreview = {
  rows: ImportRow[];
  errorCount: number;
  warningCount: number;
  importable: number;
  newBytes: string[];
  headerError?: string;
};

const NAME_HEADERS = ["name", "cadet name", "cadet", "full name"];
const BYTE_HEADERS = ["byte", "byte name"];
const NOTES_HEADERS = ["notes", "remarks"];

export async function previewImport(
  batchId: string,
  csvText: string,
  opts: { createMissingBytes: boolean; includeDuplicates: boolean },
): Promise<ImportPreview> {
  const empty = { rows: [], errorCount: 0, warningCount: 0, importable: 0, newBytes: [] };
  if (csvText.length > 1_000_000) return { ...empty, headerError: "The file is too large (max 1 MB)." };
  const table = parseCsv(csvText);
  if (table.length === 0) return { ...empty, headerError: "The file is empty." };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));
  const byteIdx = header.findIndex((h) => BYTE_HEADERS.includes(h));
  const notesIdx = header.findIndex((h) => NOTES_HEADERS.includes(h));
  if (nameIdx < 0) return { ...empty, headerError: 'The first row must be a header containing a "name" column.' };
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return { ...empty, headerError: `Too many rows (max ${MAX_IMPORT_ROWS}).` };
  }

  const [bytes, existing] = await Promise.all([
    prisma.byte.findMany({ where: { batchId } }),
    prisma.cadet.findMany({ where: { batchId, status: "ACTIVE" }, select: { name: true } }),
  ]);
  const byteByName = new Map(bytes.map((b) => [b.name.toLowerCase(), b]));
  const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  const seenInFile = new Map<string, number>();
  const newBytes = new Set<string>();

  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const line = i + 2;
    const name = (cells[nameIdx] ?? "").trim().replace(/\s+/g, " ");
    const byte = byteIdx >= 0 ? (cells[byteIdx] ?? "").trim() : "";
    const notes = notesIdx >= 0 ? (cells[notesIdx] ?? "").trim() : "";
    const errors: string[] = [];
    const warnings: string[] = [];
    let willCreateByte = false;
    if (!name) errors.push("Name is required.");
    if (name.length > 120) errors.push("Name is longer than 120 characters.");
    if (notes.length > 1000) errors.push("Notes are longer than 1000 characters.");
    if (byte) {
      if (byte.length > 40) errors.push("Byte name is longer than 40 characters.");
      else if (!byteByName.has(byte.toLowerCase())) {
        if (opts.createMissingBytes) {
          willCreateByte = true;
          newBytes.add(byte);
        } else errors.push(`Byte "${byte}" does not exist in this batch.`);
      }
    }
    const key = name.toLowerCase();
    if (name) {
      if (existingNames.has(key)) warnings.push("A cadet with this name is already on the roster.");
      const prev = seenInFile.get(key);
      if (prev) warnings.push(`Same name as row ${prev}.`);
      else seenInFile.set(key, line);
    }
    return { line, name, byte, notes, errors, warnings, willCreateByte };
  });

  const errorCount = rows.filter((r) => r.errors.length).length;
  const warningCount = rows.filter((r) => !r.errors.length && r.warnings.length).length;
  const importable = rows.filter((r) => !r.errors.length && (opts.includeDuplicates || !r.warnings.length)).length;
  return { rows, errorCount, warningCount, importable, newBytes: [...newBytes] };
}

export async function commitImport(
  actor: Actor,
  input: { batchId: string; csvText: string; createMissingBytes: boolean; includeDuplicates: boolean },
) {
  const batch = await assertBatchWritable(input.batchId);
  const preview = await previewImport(batch.id, input.csvText, input);
  if (preview.headerError) throw invalid(preview.headerError);
  if (preview.errorCount > 0) throw invalid(`Fix the ${preview.errorCount} row(s) with errors before importing.`);
  const rows = preview.rows.filter((r) => input.includeDuplicates || !r.warnings.length);
  if (rows.length === 0) throw invalid("There are no rows to import.");

  return prisma.$transaction(async (tx) => {
    const bytes = await tx.byte.findMany({ where: { batchId: batch.id } });
    const byteByName = new Map(bytes.map((b) => [b.name.toLowerCase(), b.id]));
    let order = bytes.reduce((m, b) => Math.max(m, b.sortOrder), -1);
    for (const name of preview.newBytes) {
      const b = await tx.byte.create({ data: { batchId: batch.id, name, sortOrder: ++order } });
      byteByName.set(name.toLowerCase(), b.id);
    }
    const created = await tx.cadet.createManyAndReturn({
      select: { id: true, name: true },
      data: rows.map((r) => ({
        batchId: batch.id,
        name: r.name,
        byteId: r.byte ? (byteByName.get(r.byte.toLowerCase()) ?? null) : null,
        notes: r.notes || null,
      })),
    });
    await writeAuditMany(
      tx,
      created.map((c) => ({
        actorId: actor.id,
        action: "cadet.created",
        entityType: "Cadet",
        entityId: c.id,
        batchId: batch.id,
        cadetId: c.id,
        summary: `Added ${c.name} to the roster (CSV import)`,
        changes: { bulk: true },
      })),
    );
    await writeAudit(tx, {
      actorId: actor.id,
      action: "roster.imported",
      entityType: "Batch",
      entityId: batch.id,
      batchId: batch.id,
      summary: `Imported ${created.length} cadets from CSV${preview.newBytes.length ? ` and created ${preview.newBytes.length} bytes` : ""}`,
      changes: { count: created.length, newBytes: preview.newBytes },
    });
    return { created: created.length, newBytes: preview.newBytes.length };
  });
}

export const exportSchema = z.object({
  batchId: z.string().min(1),
  dataset: z.enum(["records", "statements", "roster"]),
  type: z.enum(["NOR", "CROW"]).optional(),
  byteId: z.string().optional(),
  cadetId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(["NOT_SUBMITTED", "PENDING_REVIEW", "REWRITE_REQUIRED", "ACCEPTED", "OUTSTANDING"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeVoided: z.boolean().optional(),
});
export type ExportInput = z.infer<typeof exportSchema>;

export async function buildExport(actor: Actor, input: ExportInput) {
  const batch = await getBatch(input.batchId);
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = batch.name.replace(/[^A-Za-z0-9_-]+/g, "-");
  let csv: string;
  let count: number;

  if (input.dataset === "records") {
    const rows = await prisma.record.findMany({
      where: recordWhere(batch.id, {
        type: input.type as RecordType | undefined,
        byteId: input.byteId,
        cadetId: input.cadetId,
        categoryId: input.categoryId,
        from: input.from,
        to: input.to,
        includeVoided: input.includeVoided,
      }),
      include: { cadet: { include: { byte: true } }, category: true, occurrence: true, createdBy: true, updatedBy: true },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
    });
    count = rows.length;
    csv = toCsv(
      ["Record ID", "Batch", "Type", "Cadet", "Byte", "Date", "Time", "Category", "Description", "Notes", "Reference", "Occurrence", "Status", "Void reason", "Created at", "Created by", "Last updated", "Updated by"],
      rows.map((r) => [
        r.id, batch.name, r.type, r.cadet.name, r.cadet.byte?.name ?? "", dateOnlyISO(r.occurredOn), r.occurredTime ?? "",
        r.category?.name ?? "", r.description, r.notes ?? "", r.referenceNo ?? "", r.occurrence?.title ?? "", r.status,
        r.voidReason ?? "", r.createdAt, r.createdBy.name, r.updatedAt, r.updatedBy?.name ?? "",
      ]),
    );
  } else if (input.dataset === "statements") {
    const rows = await prisma.statement.findMany({
      where: statementWhere(batch.id, {
        status: input.status as StatementStatus | "OUTSTANDING" | undefined,
        byteId: input.byteId,
        cadetId: input.cadetId,
        from: input.from,
        to: input.to,
        includeVoided: input.includeVoided,
      }),
      include: {
        cadet: { include: { byte: true } },
        occurrence: true,
        createdBy: true,
        versions: { where: { retractedAt: null }, orderBy: { versionNumber: "desc" }, take: 1 },
        reviews: { where: { retractedAt: null }, orderBy: { reviewedAt: "desc" }, take: 1 },
      },
      orderBy: [{ issuedOn: "asc" }, { createdAt: "asc" }],
    });
    count = rows.length;
    const now = new Date();
    csv = toCsv(
      ["Statement ID", "Batch", "Cadet", "Byte", "Subject", "Status", "Issued on", "Deadline", "Overdue", "Submissions", "Last handed in", "Last hand-in late", "Latest feedback", "Occurrence", "Notes", "Voided", "Created by", "Last updated"],
      rows.map((s) => {
        const last = s.versions[0];
        const overdue = !s.voided && (s.status === "NOT_SUBMITTED" || s.status === "REWRITE_REQUIRED") && s.dueAt < now;
        return [
          s.id, batch.name, s.cadet.name, s.cadet.byte?.name ?? "", s.title, statementStatusLabel[s.status],
          dateOnlyISO(s.issuedOn), `${toISODateInTz(s.dueAt)} ${toTimeInTz(s.dueAt)}`, overdue ? "Yes" : "No",
          last?.versionNumber ?? 0, last ? `${toISODateInTz(last.receivedAt)} ${toTimeInTz(last.receivedAt)}` : "",
          last?.dueAt && last.receivedAt > last.dueAt ? "Yes" : last ? "No" : "", s.reviews[0]?.feedback ?? "",
          s.occurrence?.title ?? "", s.notes ?? "", s.voided ? "Yes" : "No", s.createdBy.name, s.updatedAt,
        ];
      }),
    );
  } else {
    const { listRoster } = await import("./cadets");
    const rows = await listRoster(batch.id, { byteId: input.byteId, includeInactive: true });
    count = rows.length;
    csv = toCsv(
      ["Cadet ID", "Batch", "Name", "Byte", "Status", "NORs", "CROWs", "Statements", "Outstanding statements"],
      rows.map((r) => [r.id, batch.name, r.name, r.byteName ?? "", r.status, r.nor, r.crow, r.statements, r.outstanding]),
    );
  }

  await writeAudit(prisma, {
    actorId: actor.id,
    action: "export.created",
    entityType: "Batch",
    entityId: batch.id,
    batchId: batch.id,
    summary: `Exported ${count} ${input.dataset} rows to CSV`,
    changes: { filters: input as unknown as Record<string, string> },
  });
  return { csv, filename: `str1k3-${safeName}-${input.dataset}-${stamp}.csv` };
}
