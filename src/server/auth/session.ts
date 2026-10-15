import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "str1k3_session";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Only write lastSeenAt at most this often, to avoid a DB write per request. */
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

export type ValidatedSession = {
  sessionId: string;
  user: SessionUser;
  /** True when the cookie should be re-issued with a fresh idle expiry. */
  renewed: boolean;
};

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  // A brand-new random token on every sign-in prevents session fixation.
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.sessionMaxDays * DAY_MS);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 100) ?? null,
    },
  });
  return { token, cookieExpires: cookieExpiry(now, expiresAt) };
}

export function cookieExpiry(lastSeen: Date, absoluteExpiry: Date) {
  const idle = new Date(lastSeen.getTime() + env.sessionIdleDays * DAY_MS);
  return idle < absoluteExpiry ? idle : absoluteExpiry;
}

export async function validateSessionToken(token: string, now = new Date()): Promise<ValidatedSession | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  const idleExpired = now.getTime() - session.lastSeenAt.getTime() > env.sessionIdleDays * DAY_MS;
  if (session.expiresAt <= now || idleExpired || !session.user.active) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  let renewed = false;
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    renewed = true;
  }
  const u = session.user;
  return {
    sessionId: session.id,
    renewed,
    user: { id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, mustChangePassword: u.mustChangePassword },
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
