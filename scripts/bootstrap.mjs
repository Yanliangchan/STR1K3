// Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME
// when no instructor accounts exist. Safe to run on every deploy (idempotent).
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashPassword(password) {
  const N = 32768, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function housekeeping() {
  // Same rules as src/server/services/maintenance.ts: expired sessions and
  // sign-in attempts older than 30 days. Records and the audit log are untouched.
  const idleDays = Number.parseInt(process.env.SESSION_IDLE_DAYS ?? "", 10) || 7;
  const now = Date.now();
  const s = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lte: new Date(now) } }, { lastSeenAt: { lt: new Date(now - idleDays * 86400000) } }] },
  });
  const a = await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * 86400000) } } });
  if (s.count || a.count) console.log(`[bootstrap] housekeeping: removed ${s.count} expired sessions, ${a.count} old sign-in attempts.`);
}

async function main() {
  await prisma.appConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await housekeeping();
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`[bootstrap] ${count} instructor account(s) exist — nothing to do.`);
    return;
  }
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Administrator").trim();
  if (!email || password.length < 10) {
    console.warn("[bootstrap] No accounts exist. Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) and run `npm run db:seed`.");
    return;
  }
  const user = await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password), isAdmin: true, mustChangePassword: true },
  });
  await prisma.auditEvent.create({
    data: { actorId: user.id, action: "user.created", entityType: "User", entityId: user.id, summary: `Initial administrator ${name} created by bootstrap` },
  });
  console.log(`[bootstrap] Created administrator ${email}. They must change the password at first sign-in.`);
}

main()
  .catch((e) => {
    console.error("[bootstrap] failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
