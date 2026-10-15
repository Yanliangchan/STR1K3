import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  batchId?: string | null;
  cadetId?: string | null;
  summary: string;
  changes?: Prisma.InputJsonValue;
  reason?: string | null;
};

/** Append an audit event. Never include statement content in summaries. */
export async function writeAudit(tx: Tx, e: AuditInput) {
  await tx.auditEvent.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      batchId: e.batchId ?? null,
      cadetId: e.cadetId ?? null,
      summary: e.summary.slice(0, 500),
      changes: e.changes,
      reason: e.reason ?? null,
    },
  });
}

export async function writeAuditMany(tx: Tx, events: AuditInput[]) {
  if (events.length === 0) return;
  await tx.auditEvent.createMany({
    data: events.map((e) => ({
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      batchId: e.batchId ?? null,
      cadetId: e.cadetId ?? null,
      summary: e.summary.slice(0, 500),
      changes: e.changes,
      reason: e.reason ?? null,
    })),
  });
}

/** Produce a {field: {from, to}} diff for the given keys. */
type Json = string | number | boolean | null;

export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: (keyof T)[]) {
  const out: Record<string, { from: Json; to: Json }> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = normalize(before[k]);
    const b = normalize(after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k as string] = { from: a, to: b };
  }
  return out;
}

function normalize(v: unknown): Json {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return JSON.stringify(v);
}
