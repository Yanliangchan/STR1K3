import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { login } from "@/server/auth/login";
import { createSession, hashToken, revokeAllSessions, revokeSession, validateSessionToken } from "@/server/auth/session";
import { changeOwnPassword, createUser, resetUserPassword, updateUser } from "@/server/services/users";
import { makeUser, resetDb } from "../helpers";

const DAY = 86400_000;

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("CorrectHorse123");
    const b = await hashPassword("CorrectHorse123");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("CorrectHorse123");
    expect(await verifyPassword("CorrectHorse123", a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
  });
});

describe("login and sessions", () => {
  beforeEach(resetDb);

  it("signs in with correct credentials and stores only a token hash", async () => {
    const u = await makeUser({ email: "a@example.com" });
    const res = await login("A@Example.com ", "CorrectHorse123", { ip: "1.1.1.1" });
    expect(res.user.id).toBe(u.id);
    const stored = await prisma.session.findFirstOrThrow({ where: { userId: u.id } });
    expect(stored.tokenHash).toBe(hashToken(res.token));
    expect(stored.tokenHash).not.toBe(res.token);
    const v = await validateSessionToken(res.token);
    expect(v?.user.id).toBe(u.id);
  });

  it("rejects wrong passwords and unknown users with the same message", async () => {
    await makeUser({ email: "a@example.com" });
    await expect(login("a@example.com", "nope-nope-nope", {})).rejects.toThrow("Incorrect email or password.");
    await expect(login("ghost@example.com", "nope-nope-nope", {})).rejects.toThrow("Incorrect email or password.");
  });

  it("rate-limits repeated failures", async () => {
    await makeUser({ email: "a@example.com" });
    for (let i = 0; i < 5; i++) await login("a@example.com", "bad-password", {}).catch(() => {});
    await expect(login("a@example.com", "CorrectHorse123", {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("keeps a session alive across ordinary use and renews it", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    const s = await prisma.session.findFirstOrThrow({ where: { userId: u.id } });
    await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(Date.now() - 2 * DAY) } });
    const v = await validateSessionToken(token);
    expect(v).not.toBeNull();
    expect(v!.renewed).toBe(true);
    const after = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(Date.now() - after.lastSeenAt.getTime()).toBeLessThan(60_000);
  });

  it("expires after the idle timeout", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    await prisma.session.updateMany({ where: { userId: u.id }, data: { lastSeenAt: new Date(Date.now() - 8 * DAY) } });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("expires at the absolute maximum even when active", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    await prisma.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("logout and revocation invalidate access", async () => {
    const u = await makeUser();
    const a = await createSession(u.id, {});
    const b = await createSession(u.id, {});
    const va = await validateSessionToken(a.token);
    await revokeSession(va!.sessionId);
    expect(await validateSessionToken(a.token)).toBeNull();
    expect(await validateSessionToken(b.token)).not.toBeNull();
    await revokeAllSessions(u.id);
    expect(await validateSessionToken(b.token)).toBeNull();
  });

  it("deactivated users lose access immediately", async () => {
    const admin = await makeUser({ isAdmin: true });
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    await updateUser(admin, { userId: u.id, name: "X", isAdmin: false, active: false });
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("password change signs out other devices but keeps the current one", async () => {
    const u = await makeUser();
    const cur = await createSession(u.id, {});
    const other = await createSession(u.id, {});
    const v = await validateSessionToken(cur.token);
    await changeOwnPassword(u, v!.sessionId, { current: "CorrectHorse123", next: "NewPassword456", confirm: "NewPassword456" });
    expect(await validateSessionToken(cur.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).toBeNull();
  });

  it("only admins manage accounts; reset forces a password change", async () => {
    const admin = await makeUser({ isAdmin: true });
    const plain = await makeUser();
    await expect(createUser(plain, { name: "N", email: "n@example.com", password: "Password1234" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await resetUserPassword(admin, { userId: plain.id, password: "Temporary12345" });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: plain.id } });
    expect(u.mustChangePassword).toBe(true);
  });
});
