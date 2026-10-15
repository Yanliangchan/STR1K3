import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const DAY = 86_400_000;
/** Failed/successful sign-in attempts older than this are only noise. */
export const LOGIN_ATTEMPT_RETENTION_DAYS = 30;
const MIN_INTERVAL_MS = 6 * 3600_000;
let lastRun = 0;

/**
 * Housekeeping: delete expired sessions and old sign-in attempts so these
 * tables don't grow forever. Never touches records, statements or the audit log.
 */
export async function runMaintenance(now = new Date()) {
  const [sessions, attempts] = await Promise.all([
    prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lt: new Date(now.getTime() - env.sessionIdleDays * DAY) } }] },
    }),
    prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * DAY) } } }),
  ]);
  lastRun = now.getTime();
  return { sessions: sessions.count, loginAttempts: attempts.count };
}

/** Run maintenance in the background at most every 6 hours per server process. */
export function maybeRunMaintenance() {
  if (Date.now() - lastRun < MIN_INTERVAL_MS) return;
  lastRun = Date.now();
  runMaintenance().catch((e) => console.error("[str1k3] maintenance failed:", e instanceof Error ? e.message : e));
}
