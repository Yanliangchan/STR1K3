import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { runMaintenance } from "@/server/services/maintenance";
import { createSession } from "@/server/auth/session";
import { makeUser, resetDb } from "../helpers";

describe("housekeeping", () => {
  beforeEach(resetDb);

  it("removes expired sessions and old sign-in attempts, and nothing else", async () => {
    const u = await makeUser();
    await createSession(u.id, {});
    await createSession(u.id, {});
    const sessions = await prisma.session.findMany({ orderBy: { createdAt: "asc" } });
    await prisma.session.update({ where: { id: sessions[1]!.id }, data: { lastSeenAt: new Date(Date.now() - 9 * 86400_000) } });
    await prisma.loginAttempt.createMany({
      data: [
        { email: "a@example.com", success: false, createdAt: new Date(Date.now() - 40 * 86400_000) },
        { email: "a@example.com", success: false },
      ],
    });
    const auditBefore = await prisma.auditEvent.count();
    const res = await runMaintenance();
    expect(res).toEqual({ sessions: 1, loginAttempts: 1 });
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.loginAttempt.count()).toBe(1);
    expect(await prisma.auditEvent.count()).toBe(auditBefore);
  });
});
