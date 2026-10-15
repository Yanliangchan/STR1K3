/**
 * Fictional demonstration data. All names are invented.
 * Usage: npm run db:seed:demo   (refuses to run when NODE_ENV=production)
 */
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/server/auth/password";
import { createBatch, activateBatch } from "../src/server/services/batches";
import { createCategory } from "../src/server/services/categories";
import { createEntries } from "../src/server/services/entries";
import { recordReceipt, reviewStatement } from "../src/server/services/statements";
import { addDaysISO, todayISO } from "../src/lib/dates";

const FIRST = ["Alex", "Jordan", "Casey", "Riley", "Morgan", "Taylor", "Jamie", "Avery", "Quinn", "Rowan", "Skyler", "Reese", "Dakota", "Hayden", "Emerson", "Finley", "Harper", "Kai", "Logan", "Parker", "Sage", "Tatum", "Blake", "Cameron", "Devon", "Elliot", "Frankie", "Gray", "Indigo", "Jules"];
const LAST = ["Tan", "Lim", "Ng", "Wong", "Lee", "Koh", "Ong", "Chua", "Goh", "Teo", "Ho", "Yeo", "Sim", "Low", "Chan"];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to load demo data in production.");
  if (await prisma.batch.findFirst({ where: { name: "14/26 MDST" } })) {
    console.log("Demo data already present.");
    return;
  }
  let admin = await prisma.user.findFirst({ where: { isAdmin: true } });
  if (!admin) {
    admin = await prisma.user.create({
      data: { email: "admin@example.com", name: "Demo Admin", passwordHash: await hashPassword("DemoPassword123!"), isAdmin: true },
    });
  }
  await prisma.user.upsert({
    where: { email: "instructor@example.com" },
    update: {},
    create: { email: "instructor@example.com", name: "Demo Instructor", passwordHash: await hashPassword("DemoPassword123!") },
  });
  const actor = { id: admin.id, name: admin.name, isAdmin: true };

  const cats: Record<string, string> = {};
  for (const [t, n] of [["NOR", "Punctuality"], ["NOR", "Turnout"], ["NOR", "Room inspection"], ["CROW", "Conduct"], ["CROW", "Safety"], ["CROW", "Property"]] as const) {
    cats[`${t}:${n}`] = (await createCategory(actor, { recordType: t, name: n })).id;
  }

  const old = await createBatch(actor, { name: "13/26 MDST", description: "Previous intake (fictional)", expectedSize: 10, bytes: ["Byte A", "Byte B"] });
  const batch = await createBatch(actor, { name: "14/26 MDST", description: "Fictional demo batch", expectedSize: 30, bytes: ["Byte 1", "Byte 2", "Byte 3"] });
  const bytes = await prisma.byte.findMany({ where: { batchId: batch.id }, orderBy: { sortOrder: "asc" } });
  const oldBytes = await prisma.byte.findMany({ where: { batchId: old.id }, orderBy: { sortOrder: "asc" } });

  await prisma.cadet.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({ batchId: batch.id, byteId: bytes[i % 3]!.id, name: `${FIRST[i]} ${LAST[i % LAST.length]}` })),
  });
  await prisma.cadet.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({ batchId: old.id, byteId: oldBytes[i % 2]!.id, name: `${FIRST[(i + 7) % 30]} ${LAST[(i + 3) % LAST.length]}` })),
  });
  const cadets = await prisma.cadet.findMany({ where: { batchId: batch.id }, orderBy: { name: "asc" } });
  const oldCadets = await prisma.cadet.findMany({ where: { batchId: old.id } });
  const today = todayISO();
  const key = () => crypto.randomUUID();

  // Historical batch data (must never appear in the active batch).
  await createEntries(actor, { idempotencyKey: key(), batchId: old.id, kind: "NOR", cadetIds: oldCadets.slice(0, 4).map((c) => c.id), date: addDaysISO(today, -60), description: "Late for first parade.", categoryId: cats["NOR:Punctuality"] });

  // Active batch data.
  await createEntries(actor, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id, cadets[1]!.id, cadets[2]!.id], date: addDaysISO(today, -12), time: "06:30", description: "Late for morning muster.", categoryId: cats["NOR:Punctuality"] });
  await createEntries(actor, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: addDaysISO(today, -8), description: "Late for lecture.", categoryId: cats["NOR:Punctuality"] });
  await createEntries(actor, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: addDaysISO(today, -3), description: "Late returning from break.", categoryId: cats["NOR:Punctuality"] });
  await createEntries(actor, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: cadets.slice(5, 9).map((c) => c.id), date: addDaysISO(today, -6), description: "Bunk not made to standard during inspection.", categoryId: cats["NOR:Room inspection"], occurrence: { mode: "new", title: "Week 2 room inspection" } });
  await createEntries(actor, { idempotencyKey: key(), batchId: batch.id, kind: "CROW", cadetIds: [cadets[10]!.id, cadets[11]!.id], date: addDaysISO(today, -5), description: "Horseplay in the stairwell.", categoryId: cats["CROW:Safety"], occurrence: { mode: "new", title: "Stairwell incident" } });
  await createEntries(actor, { idempotencyKey: key(), batchId: batch.id, kind: "CROW", cadetIds: [cadets[14]!.id], date: addDaysISO(today, -2), description: "Used another cadet's equipment without permission.", categoryId: cats["CROW:Property"] });

  const stmt = await createEntries(actor, {
    idempotencyKey: key(),
    batchId: batch.id,
    kind: "STATEMENT",
    cadetIds: cadets.slice(18, 23).map((c) => c.id),
    date: addDaysISO(today, -1),
    description: "Account for the missing food items from the instructors' pantry on the evening of the field exercise.",
    instructions: "Handwritten, one page, submit to duty instructor.",
    occurrence: { mode: "new", title: "Instructors' pantry" },
  });
  const [s1, s2, s3, s4] = stmt.created;
  await recordReceipt(actor, { statementId: s1!.id, content: "I was at the vehicle park from 1800 to 2000 and did not enter the pantry." });
  await recordReceipt(actor, { statementId: s2!.id, content: "I don't know." });
  await reviewStatement(actor, { statementId: s2!.id, outcome: "REWRITE_REQUIRED", feedback: "Give times and locations for the whole evening." });
  await recordReceipt(actor, { statementId: s3!.id, content: "From 1830 I was in the study room with my byte mates until lights out." });
  await reviewStatement(actor, { statementId: s3!.id, outcome: "ACCEPTED" });
  await recordReceipt(actor, { statementId: s4!.id, content: "I was on guard duty at the main gate from 1900." });

  await activateBatch(actor, { batchId: batch.id, confirmName: batch.name });
  console.log("Demo data loaded. Sign in as admin@example.com or instructor@example.com with password DemoPassword123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
