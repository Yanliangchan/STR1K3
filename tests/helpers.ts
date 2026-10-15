import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/server/auth/password";
import type { Actor } from "@/server/actor";
import { createBatch, activateBatch } from "@/server/services/batches";

const TABLES = [
  "AuditEvent", "StatementReview", "StatementVersion", "Statement", "Record", "BulkOperation", "Occurrence",
  "Cadet", "Byte", "Category", "Session", "LoginAttempt", "AppConfig", "Batch", "User",
];

export async function resetDb() {
  // TRUNCATE bypasses the row-level append-only / no-delete triggers (test-only).
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
  await prisma.appConfig.create({ data: { id: 1 } });
}

let pw: string | null = null;
export async function makeUser(opts: { isAdmin?: boolean; email?: string; password?: string } = {}): Promise<Actor> {
  const password = opts.password ?? "CorrectHorse123";
  pw ??= await hashPassword("CorrectHorse123");
  const u = await prisma.user.create({
    data: {
      name: opts.isAdmin ? "Admin Tester" : "Instructor Tester",
      email: opts.email ?? `${randomUUID()}@example.com`,
      passwordHash: password === "CorrectHorse123" ? pw : await hashPassword(password),
      isAdmin: !!opts.isAdmin,
    },
  });
  return { id: u.id, name: u.name, isAdmin: u.isAdmin };
}

export async function makeBatch(actor: Actor, opts: { name?: string; cadets?: number; activate?: boolean } = {}) {
  const batch = await createBatch(actor, { name: opts.name ?? `Batch ${randomUUID().slice(0, 6)}`, bytes: ["Byte 1", "Byte 2"] });
  const bytes = await prisma.byte.findMany({ where: { batchId: batch.id }, orderBy: { sortOrder: "asc" } });
  const n = opts.cadets ?? 5;
  await prisma.cadet.createMany({
    data: Array.from({ length: n }, (_, i) => ({ batchId: batch.id, byteId: bytes[i % 2]!.id, name: `Cadet ${String(i + 1).padStart(2, "0")}` })),
  });
  const cadets = await prisma.cadet.findMany({ where: { batchId: batch.id }, orderBy: { name: "asc" } });
  if (opts.activate) await activateBatch(actor, { batchId: batch.id, confirmName: batch.name });
  return { batch, bytes, cadets };
}

export const key = () => randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);
