import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { getDummyHash, verifyPassword } from "./password";
import { createSession } from "./session";
import { writeAudit } from "@/server/audit";
import { maybeRunMaintenance } from "@/server/services/maintenance";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 30;

export async function login(
  emailRaw: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null },
) {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - WINDOW_MS);
  const [emailFailures, ipFailures] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    meta.ip
      ? prisma.loginAttempt.count({ where: { ip: meta.ip, success: false, createdAt: { gte: since } } })
      : Promise.resolve(0),
  ]);
  if (emailFailures >= MAX_FAILURES_PER_EMAIL || ipFailures >= MAX_FAILURES_PER_IP) {
    throw new AppError("RATE_LIMITED", "Too many failed sign-in attempts. Wait 15 minutes and try again.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : (await verifyPassword(password, await getDummyHash()), false);

  await prisma.loginAttempt.create({ data: { email, ip: meta.ip ?? null, success: ok && !!user?.active } });

  if (!user || !ok || !user.active) {
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  }

  const session = await createSession(user.id, meta);
  maybeRunMaintenance();
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit(prisma, {
    actorId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} signed in`,
  });
  return { user, ...session };
}
